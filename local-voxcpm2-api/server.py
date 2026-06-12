from __future__ import annotations

import base64
import inspect
import logging
import os
import platform
import tempfile
import threading
import time
from io import BytesIO
from pathlib import Path
from typing import Any, Literal

import numpy as np
import soundfile as sf
from fastapi import FastAPI, HTTPException, Response
from pydantic import BaseModel, Field


MODEL_ID = os.getenv("VOXCPM_MODEL_ID", "openbmb/VoxCPM2")
DEVICE = os.getenv("VOXCPM_DEVICE", "")
OPTIMIZE = os.getenv("VOXCPM_OPTIMIZE", "false" if platform.system() == "Windows" else "true").lower() in {
    "1",
    "true",
    "yes",
    "on",
}

LOG_DIR = Path(__file__).resolve().parent / "logs"
LOG_DIR.mkdir(exist_ok=True)
logging.basicConfig(
    filename=LOG_DIR / "server.log",
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("local-voxcpm2-api")

app = FastAPI(title="Thalika Local VoxCPM2 API", version="0.1.0")

_model: Any | None = None
_model_lock = threading.Lock()
_loaded_at: float | None = None
_loading_started_at: float | None = None


class GenerateRequest(BaseModel):
    target_text: str = Field(min_length=1, max_length=4096)
    ref_audio_wav_base64: str = Field(min_length=1)
    ref_audio_format: Literal["wav", "mp3", "m4a", "audio"] = "wav"
    prompt_text: str = ""
    cfg_value: float = Field(default=2.0, ge=1.0, le=3.0)
    inference_timesteps: int = Field(default=10, ge=1, le=80)
    normalize: bool = False
    denoise: bool = False


def _load_model() -> Any:
    global _model, _loaded_at, _loading_started_at

    if _model is not None:
        return _model

    with _model_lock:
        if _model is not None:
            return _model

        _loading_started_at = time.time()
        logger.info("Importing voxcpm package")
        from voxcpm import VoxCPM
        logger.info("Imported voxcpm package")

        kwargs: dict[str, Any] = {}
        if DEVICE:
            kwargs["device"] = DEVICE
        kwargs["optimize"] = OPTIMIZE

        try:
            logger.info("Loading VoxCPM model_id=%s device=%s optimize=%s", MODEL_ID, DEVICE or "auto", OPTIMIZE)
            _model = VoxCPM.from_pretrained(MODEL_ID, **kwargs)
            _loaded_at = time.time()
            logger.info("Loaded VoxCPM model_id=%s sample_rate=%s", MODEL_ID, _sample_rate(_model))
            return _model
        except Exception:
            logger.exception("Failed to load VoxCPM model")
            raise
        finally:
            _loading_started_at = None


def _sample_rate(model: Any) -> int:
    tts_model = getattr(model, "tts_model", None)
    for owner in (tts_model, model):
        if owner is not None and hasattr(owner, "sample_rate"):
            return int(getattr(owner, "sample_rate"))
    return 48_000


def _call_generate(model: Any, request: GenerateRequest, reference_path: str) -> np.ndarray:
    params = inspect.signature(model.generate).parameters
    kwargs: dict[str, Any] = {}

    def add(name: str, value: Any) -> None:
        if name in params:
            kwargs[name] = value

    add("text", request.target_text)
    add("target_text", request.target_text)
    add("reference_wav_path", reference_path)
    add("cfg_value", request.cfg_value)
    add("inference_timesteps", request.inference_timesteps)
    add("normalize", request.normalize)
    add("denoise", request.denoise)

    if request.prompt_text.strip():
        add("prompt_text", request.prompt_text.strip())
        add("prompt_wav_path", reference_path)

    try:
        audio = model.generate(**kwargs)
    except TypeError:
        # Older or lower-level APIs can expose target_text instead of text.
        kwargs.pop("text", None)
        kwargs["target_text"] = request.target_text
        audio = model.generate(**kwargs)

    if hasattr(audio, "detach"):
        audio = audio.detach().cpu().numpy()

    audio_array = np.asarray(audio, dtype=np.float32).squeeze()
    if audio_array.size == 0:
        raise HTTPException(status_code=502, detail="VoxCPM2 returned empty audio.")

    return audio_array


def _write_reference_file(request: GenerateRequest, directory: str) -> str:
    try:
        audio_bytes = base64.b64decode(request.ref_audio_wav_base64, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid reference audio base64.") from exc

    suffix = f".{request.ref_audio_format}"
    if suffix == ".audio":
        suffix = ".wav"

    reference_path = Path(directory) / f"reference{suffix}"
    reference_path.write_bytes(audio_bytes)
    return str(reference_path)


@app.get("/info")
def info() -> dict[str, Any]:
    return {
        "ok": True,
        "model_id": MODEL_ID,
        "device": DEVICE or "auto",
        "optimize": OPTIMIZE,
        "model_loaded": _model is not None,
        "model_loading": _loading_started_at is not None,
        "loading_started_at": _loading_started_at,
        "loaded_at": _loaded_at,
        "endpoints": ["/info", "/generate"],
    }


@app.post("/load")
def load() -> dict[str, Any]:
    try:
        model = _load_model()
        return {
            "ok": True,
            "model_id": MODEL_ID,
            "sample_rate": _sample_rate(model),
            "loaded_at": _loaded_at,
        }
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail={
                "message": str(exc),
                "type": exc.__class__.__name__,
                "log_file": str(LOG_DIR / "server.log"),
                "hint": "On Windows, keep VOXCPM_OPTIMIZE=false. Check CUDA/PyTorch dependencies and the log file.",
            },
        ) from exc


@app.post("/generate")
def generate(request: GenerateRequest) -> Response:
    try:
        with tempfile.TemporaryDirectory(prefix="thalika-voxcpm2-api-") as directory:
            reference_path = _write_reference_file(request, directory)
            model = _load_model()
            audio = _call_generate(model, request, reference_path)
            sample_rate = _sample_rate(model)

            buffer = BytesIO()
            sf.write(buffer, audio, sample_rate, format="WAV", subtype="PCM_16")
            return Response(content=buffer.getvalue(), media_type="audio/wav")
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Generation failed")
        raise HTTPException(
            status_code=500,
            detail={
                "message": str(exc),
                "type": exc.__class__.__name__,
                "log_file": str(LOG_DIR / "server.log"),
            },
        ) from exc
