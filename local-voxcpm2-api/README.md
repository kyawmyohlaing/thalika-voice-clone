# Local VoxCPM2 API

This is a small FastAPI wrapper for running VoxCPM2 locally or on a rented GPU server.
It implements the API expected by Thalika's `Local VoxCPM2` provider:

- `GET /info`
- `POST /generate`

## Setup

Use Python 3.10 or 3.11 with an NVIDIA GPU/CUDA environment when possible.

```powershell
cd C:\strategy_test\thalika-voice-clone\local-voxcpm2-api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

If PyTorch needs a CUDA-specific wheel for your GPU, install that first from the
official PyTorch selector, then run `pip install -r requirements.txt`.

## Run

```powershell
.\start.ps1
```

The server listens on:

```text
http://localhost:8000
```

Then keep this in the Next app `.env.local`:

```env
VOXCPM_LOCAL_API_URL=http://localhost:8000
VOXCPM_LOCAL_INFERENCE_TIMEOUT=300000
```

Restart the Next app after changing `.env.local`.

Before generating from the UI, you can warm up the model:

```powershell
Invoke-RestMethod -Method Post http://localhost:8000/load
```

Wait until this finishes. The first load can take several minutes because model
weights may be downloaded and moved to the selected device.

## Environment

- `VOXCPM_MODEL_ID`: defaults to `openbmb/VoxCPM2`
- `VOXCPM_DEVICE`: optional, for example `cuda` or `cpu`
- `VOXCPM_PORT`: defaults to `8000`
- `VOXCPM_LOCAL_INFERENCE_TIMEOUT`: Next app timeout in milliseconds; defaults to `300000`

## Notes

The first request loads the VoxCPM2 model, so it can take a while and download
model weights. CPU mode can be very slow; GPU is strongly recommended.
