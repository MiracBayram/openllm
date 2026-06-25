<div align="center">
  <img src="https://raw.githubusercontent.com/Tauri-Apps/tauri/HEAD/app-icon.png" width="120" alt="Forge Logo">
  <h1>🌌 Forge / OpenLLM</h1>
  <p><b>The Apex Architecture: Zero-Copy, High-Performance Local AI Inference</b></p>
  
  <p>
    <a href="https://github.com/tauri-apps/tauri/releases"><img src="https://img.shields.io/badge/Tauri-v2.0-24C8C6.svg?style=for-the-badge&logo=tauri" alt="Tauri"></a>
    <a href="https://rust-lang.org"><img src="https://img.shields.io/badge/Rust-1.80+-F74C00.svg?style=for-the-badge&logo=rust" alt="Rust"></a>
    <a href="https://preactjs.com/"><img src="https://img.shields.io/badge/Preact-10.x-673ab7.svg?style=for-the-badge&logo=preact" alt="Preact"></a>
    <a href="https://vitejs.dev"><img src="https://img.shields.io/badge/Vite-5.x-646CFF.svg?style=for-the-badge&logo=vite" alt="Vite"></a>
    <a href="https://react-three-fiber.pmnd.rs/"><img src="https://img.shields.io/badge/R3F-WebGL-black.svg?style=for-the-badge&logo=three.js" alt="R3F"></a>
    <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="License">
  </p>
  <p>
    <em>Windows (x64, ARM64, x86) • macOS (Universal) • Linux (AppImage, DEB, RPM)</em>
  </p>
</div>

---

## 📖 Introduction

**Forge (OpenLLM)** is a brutally optimized, bare-metal local AI inference orchestrator. Designed for extreme performance and deep hardware integration, it completely eliminates the bottlenecks of JSON-based IPC, standard output parsing, and bloated Electron wrappers found in standard tools.

By leveraging native OS bindings, zero-copy memory mapping, and a next-generation UI architecture built on Preact and WebGL, Forge extracts maximum performance from your hardware. Whether you're running heavily quantized `.gguf` models on a fanless laptop or unquantized beasts on a multi-GPU rig, Forge ensures every FLOP counts. Your data remains 100% offline and secure.

> [!IMPORTANT]  
> **v1.0.0 Stable is now available!** We have completely revamped the build matrix, resolved cross-platform linker panics, and optimized our Preact/Rollup chunking. 

---

## 📥 Quick Start (For End Users)

The easiest way to use Forge is to download the pre-compiled, ready-to-use application. **No programming knowledge, Node.js, or Rust is required.**

1. Head over to the [Releases](https://github.com/YOUR_USERNAME/forge/releases/latest) page.
2. Download the installer for your Operating System:
   - **Windows:** Download the `.msi` or `.exe` setup file. (Available for x64, ARM64, and x86 32-bit).
   - **macOS:** Download the `.dmg` file. (Universal binary native for both Apple Silicon M-Series and Intel).
   - **Linux:** Download the `.AppImage` (portable, double-click to run on any distro including Arch) or `.deb` (Debian/Ubuntu).
3. Double-click the downloaded file and enjoy local AI!

---

## 🆚 Why Forge? (The Unfair Advantage)

When compared to existing local AI wrappers (like LM Studio, GPT4All, or Ollama), Forge's architecture provides a massive leap in efficiency.

| Feature | Forge / OpenLLM | LM Studio / Others |
| :--- | :--- | :--- |
| **Framework** | Tauri v2 (Rust) + Preact | Electron + Heavy React |
| **Idle RAM Footprint** | **~25 MB** (Virtually invisible) | ~400 MB to 1 GB+ |
| **Token Transfer** | `memmap2` (Zero-Copy Physical Memory) | `stdout` pipes (High overhead JSON/UTF-8 parsing) |
| **Telemetry HUD** | Real-time 60Hz Binary WebSockets | Slower React Context / Polling |
| **Multi-Engine** | Yes (6 Engines, Dynamic Adaptation) | Mostly restricted to `llama.cpp` |
| **App Bundle Size** | **~15 MB** | 400 MB+ |

**The RAM Advantage:** Because Forge uses Tauri instead of Electron, it uses the native OS webview (Edge WebView2 on Windows, WebKit on macOS/Linux). Combined with Preact instead of React, the UI's memory footprint is negligible. **Every single megabyte of RAM saved is given directly to the AI models**, allowing you to load larger context windows or larger models without hitting swap memory or OOM (Out-of-Memory) crashes.

---

## 🔥 Key Features Showcase

### ⚙️ Multi-Engine Adaptation & Routing
Forge is not locked into a single inference backend. It features a **Dynamic Engine Router** that seamlessly adapts to your hardware and the specific model you load. 
It supports **6 Backend Engines** out of the box:
1. **llama.cpp:** The rock-solid default for CPU, Apple Metal, and general GPU (CUDA/Vulkan) inference for GGUF models.
2. **vLLM:** Automatically selected for high-throughput, multi-user requests utilizing PagedAttention.
3. **MLX:** Dynamically adapted if an Apple Silicon (M1/M2/M3) unified memory architecture is detected.
4. **LMDeploy:** Leveraged for TurboMind/TurboInfer optimization on compatible NVIDIA setups.
5. **TensorRT-LLM:** Engaged for absolute maximum throughput on high-end NVIDIA RTX rigs.
6. **PowerInfer-2:** Used for sparse inference when running massive models on consumer hardware.

**How it works:** When you select a model, Forge's `profiler` parses the model headers, checks your physical hardware (VRAM, RAM, CPU flags), and routes the task to the most efficient engine adapter. If an engine crashes, the router gracefully falls back to the next best compatible engine.

### 🧠 Drag & Drop RAG (Vector Database)
- **Instant Ingestion:** Seamlessly drag and drop PDFs, Markdown, and TXT files directly into the UI to instantly index them into your local vector database.
- **Offline Privacy:** Chat with your private documents instantly. Zero data leaves your machine.
- **Vector Galaxy 3D:** Features a stunning interactive 3D visualization using `React-Three-Fiber` and WebGL shaders to visualize your embedding clusters and semantic relationships in real-time.

### 🤖 Autonomous Agent Orchestration
Forge goes beyond simple chat interfaces by allowing you to create and manage an army of custom autonomous agents.
- Assign specific roles, constraints, and system prompts to individual agents.
- Toggle agents on/off and route specific queries to specialized agents in your workspace.

### 🌐 UDP Multicast Swarm (Star Orchestration)
Forge features a built-in P2P Swarm module. By utilizing UDP Multicast, multiple Forge instances on the same local network can automatically discover each other. This paves the way for distributed "Star Orchestration" inference, where heavy compute tasks can be sharded across multiple machines in your home or office effortlessly.

### 🎭 Dynamic AI Personas
Switch between deeply customized AI personalities on the fly. Each persona heavily morphs the UI aesthetics (glassmorphism, brutalism, syntax highlighting) and adjusts the model's system prompt and context length:
- 🧊 **Spectral Matrix:** High-End Tactical. Precision analytics and cold logic.
- ☢️ **Neural Decay:** Brutalist Skeuomorphism. Aggressive, chaotic, raw terminal output.
- 🏭 **Kinetic Industrial:** Hard-Tech Control. Mechanical, methodical, engineered.
- 🔮 **Solar Witch:** Esoteric, fiery. Speaks in prophecies and alien intelligence.
- 🟧 **Legacy Forge:** The classic, nostalgic, and powerful default orange theme.

---

## 🛠️ The Apex Architecture (For Developers)

Forge seamlessly separates a high-performance Rust backend from a dynamic, chunk-optimized Preact UI.

### 1. Zero-Copy Memory Mapping
Traditional wrappers pipe tokens via `stdout` streams, which involves expensive UTF-8 validation and JSON parsing. Forge bypasses this entirely. Rust and the Inference Engine share token arrays via `memmap2` and a custom **Ring Buffer** (`src-tauri/src/process/ring.rs`). Tokens are read directly from physical memory.

### 2. Strict CPU Affinity & Process Control
Forge utilizes precise `CpuSet` pinning and OS-level OOM protections (`/proc/pid/oom_score_adj`) to ensure your host OS never throttles the AI engine. Background jobs are kept strictly isolated from the main thread.

### 3. Binary WebSocket IPC
Instead of Tauri's standard JSON IPC which blocks the main thread, Forge uses a dedicated `tokio`-backed Binary WebSocket Bus. Telemetry, hardware stats (VRAM, Temps, CPU from `sysinfo` and `nvml-wrapper`), and token streams are pushed to the frontend via tightly packed raw binary frames at ~60Hz.

### 4. Smart Code Splitting
The Vite frontend is hyper-optimized. Rollup `manualChunks` strictly segregates heavy dependencies (like `three.js`, `shiki` syntax highlighters, and WASM bundles) away from the core vendor chunk, ensuring the UI mounts instantly before rendering the WebGL canvases.

---

## 📁 Project Structure

```text
forge/
├── .github/workflows/         # Node 24 Automated CI/CD Matrix
├── src-tauri/                 # Rust Backend (Tauri v2)
│   ├── src/
│   │   ├── engines/           # 6 Engine Adapters (vLLM, llama.cpp, MLX, etc.)
│   │   ├── ipc/               # Binary WebSocket Server & Packet Definitions
│   │   ├── process/           # Memmap2 Token Ring Buffer & Spawner (Send-trait safe)
│   │   ├── profiler/          # GGUF Parsing & Hardware Telemetry (GPU/CPU/RAM)
│   │   ├── router/            # Smart Prompt Routing & Flags Injector
│   │   ├── storage/           # SQLite WAL Mode + r2d2 Pooling
│   │   ├── swarm/             # UDP Multicast Peer-to-Peer Networking
│   │   └── server/            # Local Axum API (CORS secure)
│   ├── Cargo.toml             # Rust Dependencies (LTO optimized)
│   └── tauri.conf.json        # Tauri configuration
├── src/                       # Frontend (Preact + Vite + Tailwind)
│   ├── components/            # UI Components (Glassmorphism, Dialogs, VectorGalaxyR3F)
│   ├── store/                 # Zustand Stores (Statically imported to avoid chunk errors)
│   └── App.tsx                # Main Router
├── package.json               # Node Dependencies
└── vite.config.ts             # Vite Bundler Config (Rollup manualChunks)
```

---

## 🛠️ Building from Source

If you want to modify the code or compile Forge yourself, follow these steps. Forge requires **Node.js (v24 LTS)** and **Rust**.

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/YOUR_USERNAME/forge.git
cd forge
npm install
```

### 2. Install OS-Specific Build Tools

<details>
<summary><b>🪟 Windows (Strict Requirements)</b></summary>
<br>
Building Tauri apps on Windows requires the Microsoft C++ Build Tools.
1. Install <b><a href="https://rustup.rs/">Rustup</a></b> and <b><a href="https://nodejs.org/">Node.js</a></b>.
2. Download the <b><a href="https://visualstudio.microsoft.com/visual-cpp-build-tools/">Visual Studio C++ Build Tools</a></b>.
3. <b>CRITICAL:</b> During installation, check <b>"Desktop development with C++"</b>. Ensure the following components are selected on the right panel:
   - MSVC v143 - VS 2022 C++ x64/x86 build tools
   - Windows 11 SDK (or Windows 10 SDK)
   - C++ CMake tools for Windows
</details>

<details>
<summary><b>🐧 Linux</b></summary>
<br>
Linux requires specific WebKit and GTK libraries for the frontend window.

**Ubuntu / Debian / Mint:**
```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev \
    build-essential \
    curl \
    wget \
    file \
    libxdo-dev \
    libssl-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    patchelf \
    rpm
```

**Fedora:**
```bash
sudo dnf install webkit2gtk4.1-devel \
    curl \
    wget \
    file \
    openssl-devel \
    libappindicator-gtk3-devel \
    librsvg2-devel \
    patchelf \
    rpm-build
```

**Arch Linux / Manjaro:**
*(Note: Ensure you have `base-devel` installed)*
```bash
sudo pacman -Syu
sudo pacman -S webkit2gtk-4.1 \
    base-devel \
    curl \
    wget \
    file \
    openssl \
    appmenu-gtk-module \
    gtk3 \
    libappindicator-gtk3 \
    librsvg \
    libvips
```
</details>

<details>
<summary><b>🍎 macOS</b></summary>
<br>

macOS requires Xcode Command Line tools.
```bash
xcode-select --install
# (Optional) If you experience OpenSSL errors during Rust compilation:
brew install openssl
```
</details>

### 3. Run Development Mode
```bash
npm run tauri dev
```
*(Note: The very first run will take 3-10 minutes as Cargo downloads and compiles all Rust crates from scratch).*

### 4. Build for Production
```bash
npm run tauri build
```
The compiled binaries will be located in `src-tauri/target/release/bundle/`.

---

## 🤝 Contributing

We welcome pull requests! To ensure code quality:
1. Ensure your Rust code is free of warnings and does not hold `!Send` variables (like Windows `HANDLE`) across `tokio::select!` await boundaries.
2. Maintain chunk size optimizations in `vite.config.ts` if adding heavy frontend dependencies.
3. Keep the UI aesthetic "premium" and dark-mode first.

If you are adding a new LLM backend engine:
1. Create a new module in `src-tauri/src/engines/`.
2. Implement the engine adapters and telemetry parsers.
3. Add the engine routing logic to `src-tauri/src/router/`.

---

## 📄 License

This project is licensed under the **MIT License**. See the `LICENSE` file for details.
