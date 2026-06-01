# Thalika

Thalika သည် Next.js, TypeScript, TailwindCSS နှင့် optional Electron desktop shell ကို အသုံးပြုထားသော local-first voice-over studio ဖြစ်သည်။

Script များ၊ generation job များ၊ generated WAV audio များနှင့် draft state ကို local `data/` folder အောက်တွင် သိမ်းဆည်းသည်။ Database မသုံးပါ။

## လက်ရှိ ပါဝင်သော Features

- Gemini API ဖြင့် script rewrite လုပ်နိုင်သော Script page
- Script input နှင့် reference audio upload ပါသော Voice Over page
- VoxCPM2 remote inference ကို အသုံးပြုသော Burmese Production provider
- Direct VoxCPM2 provider
- Workflow စမ်းသပ်ရန် Local Mock Provider
- WAV-only audio output
- Long script များအတွက် chunk ခွဲခြင်းနှင့် WAV merge လုပ်ခြင်း
- Audio preview နှင့် download
- Audio player နှင့် delete action ပါသော History page
- Local storage ကို ကြည့်ရှုနိုင်သော Folders page
- Optional Electron desktop shell

## Project Stack

- Frontend: Next.js App Router, React, TailwindCSS
- Backend: Next.js Route Handlers
- Desktop shell: Electron
- Validation: Zod
- Storage: local Markdown, JSON, WAV files
- Remote voice provider: VoxCPM2 Hugging Face Space
- Script rewrite provider: Google Gemini API

## ကြိုတင် လိုအပ်ချက်များ

- Node.js `22.12.0` သို့မဟုတ် ပိုသစ်သော version
- npm
- VoxCPM2 သို့မဟုတ် Gemini ကို အသုံးပြုမည်ဆိုပါက Internet connection

VoxCPM2 inference ကို remote Hugging Face Space မှတစ်ဆင့် run သည်။ Thalika သည် local VoxCPM2 model ကို install မလုပ်ပါ။

## Install လုပ်ခြင်း

```bash
cd /Users/zoe/Downloads/beebot/coda-voice-clone/Thalika
npm install
```

## Environment Variables

Default တန်ဖိုးများကို ပြောင်းလိုပါက သို့မဟုတ် Gemini rewrite ကို အသုံးပြုလိုပါက `.env.example` ကို `.env.local` အဖြစ် copy လုပ်ပါ။

```bash
cp .env.example .env.local
```

အသုံးပြုနိုင်သော တန်ဖိုးများ:

```bash
HF_VOXCPM2_URL=https://openbmb-voxcpm-demo.hf.space
HF_REQUEST_TIMEOUT=60000
GEMINI_REQUEST_TIMEOUT=60000
GEMINI_API_KEY=your_google_gemini_api_key_here
```

- `HF_VOXCPM2_URL`: VoxCPM2 Hugging Face Space ၏ base URL
- `HF_REQUEST_TIMEOUT`: Hugging Face request timeout milliseconds
- `GEMINI_REQUEST_TIMEOUT`: Gemini request timeout milliseconds
- `GEMINI_API_KEY`: Script page မှ rewrite လုပ်ရာတွင် အသုံးပြုသော Gemini API key

Script page ရှိ settings dialog မှတစ်ဆင့် `GEMINI_API_KEY` ကို `.env.local` ထဲသို့ သိမ်းဆည်းနိုင်သည်။

## Browser တွင် Run ခြင်း

Development mode:

```bash
npm run dev
```

Production mode:

```bash
npm run build
npm run start
```

Browser တွင် ဖွင့်ရန်:

```text
http://localhost:3000
```

## Electron Desktop App အဖြစ် Run ခြင်း

Development desktop mode:

```bash
npm run desktop
```

Production desktop mode:

```bash
npm run build
npm run desktop:start
```

Electron shell သည် local Next.js app ကို ဖွင့်ပေးသည်။ Backend အသစ်တစ်ခု ထပ်မံထည့်သွင်းထားခြင်း မရှိပါ။

Electron shell တွင် အောက်ပါ settings များကို အသုံးပြုထားသည်။

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- `webSecurity: true`
- single-instance lock

နောက်ဆုံး Electron window ကို ပိတ်လိုက်ပါက Electron process ပိတ်သွားမည်။ `desktop:start` က local Next.js server ကို စတင်ပေးထားခြင်း ဖြစ်ပါက Electron ပိတ်သည့်အခါ launcher က ထို server ကိုပါ ရပ်ပေးမည်။

Electron binary cache မပြည့်စုံပါက:

```bash
npm run repair:electron
```

## App Pages

### Script

ရှိပြီးသား script ကို Gemini ဖြင့် rewrite လုပ်ရန် ဤ page ကို အသုံးပြုပါ။

1. Script tab ကို ဖွင့်ပါ။
2. Original script ကို paste လုပ်ပါ။
3. လိုအပ်ပါက title ထည့်ပါ။
4. Gemini model ကို ရွေးပါ။
5. `Keep Burmese language` ကို လိုအပ်သလို on သို့မဟုတ် off လုပ်ပါ။
6. `Rewrite Narration` ကို နှိပ်ပါ။
7. Rewritten result ကို စစ်ဆေးပြီး လိုအပ်ပါက ပြင်ဆင်ပါ။
8. `Open Voice Over` ကို နှိပ်ပါ။

Rewritten result ကို shared Voice Over draft အဖြစ် သိမ်းဆည်းသည်။

App တွင် လက်ရှိ ပြသထားသော model options များ:

- Gemini 2.5 Flash
- Gemini 3.5 Flash
- Gemini 3.1 Flash Lite

ရွေးချယ်ထားသော model ကို configured Gemini API endpoint က လက်ခံနိုင်ရမည်။

### Voice Over

WAV audio generate လုပ်ရန် ဤ page ကို အသုံးပြုပါ။

1. Voice Over tab ကို ဖွင့်ပါ။
2. Script ကို paste လုပ်ပါ သို့မဟုတ် ပြင်ဆင်ပါ။
3. လိုအပ်ပါက title ထည့်ပါ။
4. Provider ကို ရွေးပါ။
5. `Burmese Production` သို့မဟုတ် `VoxCPM2` ကို အသုံးပြုပါက reference audio upload လုပ်ပါ။
6. လိုအပ်ပါက ပေါ်နေသော settings များကို ချိန်ညှိပါ။
7. `Generate Local Audio` ကို နှိပ်ပါ။
8. Generated WAV file ကို preview လုပ်ပါ သို့မဟုတ် download လုပ်ပါ။

အသုံးပြုနိုင်သော providers:

| Provider | အလုပ်လုပ်ပုံ |
| --- | --- |
| `Burmese Production` | VoxCPM2 provider ကို အသုံးပြုပြီး Burmese production metadata ထည့်ပေးသည် |
| `VoxCPM2` | Reference audio ကို upload လုပ်ပြီး Hugging Face remote inference တောင်းဆိုသည် |
| `Mock Provider` | Workflow စမ်းသပ်ရန် local sine-wave WAV file generate လုပ်သည် |

Voice Over controls များ:

- Reference audio upload
- Clone mode: `balanced`, `high fidelity`
- Clone strength: `1.0` မှ `3.0`
- Reference denoise
- Text normalization
- Speed: `0.8x` မှ `1.2x`
- Emotion: `neutral`, `calm`, `energetic`, `dramatic`

### History

ဤ page တွင် အောက်ပါ လုပ်ဆောင်ချက်များကို အသုံးပြုနိုင်သည်။

- သိမ်းဆည်းထားသော generation job များကို ကြည့်ရှုခြင်း
- Generated audio ကို play လုပ်ခြင်း
- Audio seek လုပ်ခြင်း
- Playback speed ပြောင်းခြင်း
- Audio download လုပ်ခြင်း
- Audio ဖွင့်ခြင်း
- History job ဖျက်ခြင်း

Completed job တစ်ခုကို ဖျက်လိုက်ပါက သက်ဆိုင်ရာ generated audio file ကိုပါ ဖျက်သည်။ သက်ဆိုင်ရာ saved script Markdown file ကို မဖျက်ပါ။

### Folders

App က စီမံထားသော local storage folders များကို ကြည့်ရှုရန် ဤ page ကို အသုံးပြုပါ။

ဤ page တွင် အောက်ပါ အချက်အလက်များကို ပြသသည်။

- Folder path
- File count
- Total size
- Latest modification time
- Recent files

Browser mode တွင် folder path ကို copy လုပ်နိုင်သည်။ Electron mode တွင် သတ်မှတ်ထားသော app-managed folders များကို Finder သို့မဟုတ် Explorer ထဲတွင် ဖွင့်နိုင်သည်။

## Validation Rules

Audio generation request များအတွက် အောက်ပါ rules များကို သတ်မှတ်ထားသည်။

| Field | Rule |
| --- | --- |
| Title | Optional၊ အများဆုံး `100` characters |
| Script | Required၊ `10` မှ `50,000` characters |
| Provider | `mock`, `voxcpm2`, သို့မဟုတ် `burmese_production` |
| Format | `wav` only |
| Speed | `0.8` မှ `1.2` |
| Emotion | `neutral`, `calm`, `energetic`, သို့မဟုတ် `dramatic` |
| Clone mode | Optional: `balanced` သို့မဟုတ် `high_fidelity` |
| Clone strength | Optional: `1.0` မှ `3.0` |
| Reference audio | VoxCPM2 နှင့် Burmese Production အတွက် required |
| Reference audio size | အများဆုံး `10 MB` |
| Reference audio duration | Duration ရရှိပါက အနည်းဆုံး `3` seconds နှင့် အများဆုံး `50` seconds |

## Long Scripts

Script အရှည်ကို အများဆုံး `50,000` characters အထိ လက်ခံသည်။

VoxCPM2 request များအတွက် script ကို အများဆုံး `420` characters ပါသော chunks များအဖြစ် ခွဲသည်။ ပြန်ရသော WAV chunk တစ်ခုချင်းစီကို temporary folder ထဲသို့ ရေးသည်။ ထို့နောက် WAV chunks များကို `data/outputs/` အောက်ရှိ final WAV file တစ်ခုအဖြစ် merge လုပ်ပြီး temporary folder ကို ဖျက်သည်။

## Local Storage

```text
data/
  scripts/              saved script Markdown files
  jobs/                 generation job Markdown files
  outputs/              generated WAV files
  memory/
    MEMORY.md           local memory notes
    MEMORY.example.md   shareable memory note example
    voice-over-draft.json
```

Script page နှင့် Voice Over page တို့သည် `data/memory/voice-over-draft.json` ကို shared draft အဖြစ် အသုံးပြုသည်။

`.env.local`, generated scripts, generation jobs, audio outputs, `MEMORY.md` နှင့် draft state များကို Git ထဲသို့ မတင်ရန် `.gitignore` တွင် တားထားသည်။ Share လုပ်နိုင်သော examples များအဖြစ် `.env.example`, folder `.gitkeep` files နှင့် `data/memory/MEMORY.example.md` ကို ထည့်ထားသည်။

## API Routes

| Method | Route | အသုံးပြုပုံ |
| --- | --- | --- |
| `GET` | `/api/health` | Local service health စစ်ခြင်း |
| `POST` | `/api/generate` | Audio generate လုပ်ခြင်း |
| `GET` | `/api/audio/{filename}` | Generated audio file ကို stream လုပ်ခြင်း |
| `GET` | `/api/history` | Generation jobs များကို ဖော်ပြခြင်း |
| `DELETE` | `/api/history/{jobId}` | Generation job ဖျက်ခြင်း |
| `GET` | `/api/scripts` | Saved scripts များကို ဖော်ပြခြင်း |
| `GET` | `/api/providers/capabilities` | Provider capability metadata ဖော်ပြခြင်း |
| `GET` | `/api/providers/voxcpm2/health` | VoxCPM2 Hugging Face Space ကို probe လုပ်ခြင်း |
| `POST` | `/api/rewrite` | Gemini ဖြင့် script rewrite လုပ်ခြင်း |
| `GET`, `POST` | `/api/settings/gemini` | Gemini API key state ဖတ်ခြင်း သို့မဟုတ် သိမ်းဆည်းခြင်း |
| `GET`, `POST`, `DELETE` | `/api/drafts/voice-over` | Shared Voice Over draft ဖတ်ခြင်း၊ သိမ်းဆည်းခြင်း သို့မဟုတ် ဖျက်ခြင်း |
| `GET` | `/api/storage/local` | App-managed local folders များကို စစ်ဆေးခြင်း |

## Local Filesystem Boundaries

- Audio serving သည် `data/outputs/` အောက်မှသာ file ဖတ်သည်။
- Generated filenames များကို sanitize လုပ်သည်။
- Storage inspection တွင် သတ်မှတ်ထားသော app-managed folders များကိုသာ ဖော်ပြသည်။
- Electron folder opening သည် သတ်မှတ်ထားသော folder IDs များကိုသာ လက်ခံသည်။
- Provider inference သည် shell commands များကို execute မလုပ်ပါ။

## VoxCPM2 Health Badge

Voice Over page သည် `/api/providers/voxcpm2/health` ကို ခေါ်သည်။

Badge တွင် အောက်ပါ status များ ပေါ်နိုင်သည်။

- `HF connected`
- `HF timeout`
- `HF rate limited`
- `HF unavailable`
- `HF invalid response`

Health result သည် လက်ရှိ probe response ကို ဖော်ပြသည်။ Audio generation သည် သီးခြား remote request ဖြစ်သည်။

## Resource Commands

လက်ရှိ memory usage ကို စစ်ရန်:

```bash
npm run metrics:memory
```

CPU နှင့် RAM ကို sample ငါးကြိမ်ဖြင့် စစ်ရန်:

```bash
npm run metrics:resources
```

ဤ commands များသည် detected Thalika, Next.js နှင့် Electron runtime processes များကို report ပြသည်။ Remote Hugging Face resource usage ကို မပြပါ။

## Verification Commands

TypeScript စစ်ရန်:

```bash
npm run lint
```

Production build စစ်ရန်:

```bash
npm run build
```

## Troubleshooting

`Generate Local Audio` button ကို နှိပ်မရပါက အောက်ပါ အချက်များကို စစ်ပါ။

- Script length
- VoxCPM2 သို့မဟုတ် Burmese Production အတွက် reference audio upload
- Reference audio file size
- Reference audio duration

VoxCPM2 generation အလုပ်မလုပ်ပါက အောက်ပါ အချက်များကို စစ်ပါ။

- Internet connection
- VoxCPM2 health badge
- `HF_VOXCPM2_URL`
- `HF_REQUEST_TIMEOUT`

Gemini rewrite အလုပ်မလုပ်ပါက အောက်ပါ အချက်များကို စစ်ပါ။

- `GEMINI_API_KEY`
- `GEMINI_REQUEST_TIMEOUT`
- Configured Gemini API က ရွေးချယ်ထားသော model ကို လက်ခံခြင်း ရှိ၊ မရှိ

Electron binary cache မပြည့်စုံပါက:

```bash
npm run repair:electron
```
