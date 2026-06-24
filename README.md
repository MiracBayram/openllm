<div align="center">
  <h1>🌌 OpenLLM</h1>
  <p><b>The Apex Architecture: Zero-Copy, High-Performance Local AI Inference</b></p>
  
  <p>
    <a href="https://rust-lang.org"><img src="https://img.shields.io/badge/Rust-1.80%2B-orange.svg?style=flat-square&logo=rust" alt="Rust"></a>
    <a href="https://tauri.app"><img src="https://img.shields.io/badge/Tauri-2.0-yellow.svg?style=flat-square&logo=tauri" alt="Tauri"></a>
    <a href="https://preactjs.com/"><img src="https://img.shields.io/badge/Preact-10.x-673ab7.svg?style=flat-square&logo=preact" alt="Preact"></a>
    <a href="https://vitejs.dev"><img src="https://img.shields.io/badge/Vite-5.x-646CFF.svg?style=flat-square&logo=vite" alt="Vite"></a>
    <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" alt="License">
  </p>
</div>

---

## 📖 Introduction

**OpenLLM** is not just another LLM wrapper; it is a brutally optimized, bare-metal local AI inference framework. Built on **The Apex Architecture**, it completely eliminates the bottleneck of JSON-based IPC and standard output parsing. 

By leveraging a `memmap2`-backed memory ring buffer, custom binary WebSockets, and a dynamic Engine Router, OpenLLM extracts maximum performance from your hardware. Whether you're running heavily quantized models on a laptop or unquantized beasts on a multi-GPU rig, OpenLLM ensures every FLOP counts.

---

## ⚡ Core Architecture (The Apex Features)

- 🧠 **Dynamic Engine Router:** Automatically selects the best backend engine for your specific model and hardware profile. Supports 6 backends out of the box:
  - `llama.cpp` (GGUF, Mac/CPU/GPU)
  - `vLLM` (High-throughput PagedAttention)
  - `LMDeploy` (TurboMind, TurboInfer)
  - `PowerInfer-2` (Sparse inference)
  - `TensorRT-LLM` (NVIDIA optimized)
  - `MLX` (Apple Silicon optimized)
- 🏎️ **Zero-Copy Memory Mapping:** Rust and the Inference Engine share token arrays via `memmap2`. No stdout parsing. No serialization overhead.
- 📡 **Binary WebSocket IPC:** Telemetry, hardware stats (VRAM, Temps, CPU), and token streams are pushed to the frontend via tightly packed raw binary frames at ~60Hz.
- 🌐 **UDP Multicast Swarm:** Automatically discovers other OpenLLM nodes on the local network (P2P) for distributed inference capabilities.
- 🗄️ **WAL-Mode Concurrency Storage:** Utilizes `r2d2` connection pooling and SQLite in Write-Ahead-Log mode for unblockable background operations.
- 🎆 **Neural UX (WebGL):** A breathtaking Matrix-style interface powered by `React-Three-Fiber` and GLSL shaders that visualizes embedding vectors and generation speed in real-time.

---

## 🛠️ Prerequisites & Setup Guides

To compile and run OpenLLM locally, you must install **Node.js (v18+)** and **Rust**. Depending on your Operating System, strict dependencies must be met.

### 🪟 Windows (Strict Requirements)
Building Tauri apps on Windows requires the Microsoft C++ Build Tools.

1. Install **[Node.js](https://nodejs.org/en/download/)** (LTS version).
2. Install **[Rustup](https://rustup.rs/)**.
3. Download the **[Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)**.
4. ⚠️ **CRITICAL:** During the Visual Studio installation, check the box for **"Desktop development with C++"**. Ensure the following components are selected on the right panel:
   - MSVC v143 - VS 2022 C++ x64/x86 build tools
   - Windows 11 SDK (or Windows 10 SDK)
   - C++ CMake tools for Windows
5. Install the **[WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)** (Usually pre-installed on Windows 11).

### 🐧 Linux
Linux requires specific WebKit and GTK libraries for the frontend window.

**Ubuntu / Debian / Mint:**
```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev \
    build-essential \
    curl \
    wget \
    file \
    libxdo-dev \
    libssl-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev
```

**Fedora:**
```bash
sudo dnf install webkit2gtk4.1-devel \
    curl \
    wget \
    file \
    openssl-devel \
    libappindicator-gtk3-devel \
    librsvg2-devel
```

**Arch Linux / Manjaro:**
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

### 🍎 macOS
macOS requires Xcode Command Line tools and Homebrew (optional but recommended).

1. Install Xcode CLI:
```bash
xcode-select --install
```
2. *(Optional)* If you experience OpenSSL errors during Rust compilation, install via brew:
```bash
brew install openssl
```

---

## 🚀 Installation & Running

1. **Clone the Repository:**
```bash
git clone https://github.com/YOUR_USERNAME/openllm.git
cd openllm
```

2. **Install Node Dependencies:**
```bash
npm install
```

3. **Start Development Mode:**
*(Note: The very first run will take 3-10 minutes as Cargo downloads and compiles all Rust crates from scratch).*
```bash
npm run tauri dev
```

4. **Build for Production (Standalone Executable):**
```bash
npm run tauri build
```
The compiled binaries will be located in `src-tauri/target/release/bundle/`.

---

## 📁 Project Structure

OpenLLM separates the high-performance backend from the dynamic UI seamlessly.

```text
openllm/
├── src-tauri/                 # Rust Backend
│   ├── src/
│   │   ├── engines/           # Decision Tree & 6 Engine Adapters (vLLM, llama.cpp...)
│   │   ├── ipc/               # Binary WebSocket Server & Packet Definitions
│   │   ├── process/           # Memmap2 Token Ring Buffer & Process Spawner
│   │   ├── profiler/          # GGUF Parsing & Hardware Telemetry (GPU/CPU/RAM)
│   │   ├── router/            # Smart Prompt Routing & Flags Injector
│   │   ├── storage/           # SQLite WAL Mode + r2d2 Pooling
│   │   ├── swarm/             # UDP Multicast Peer-to-Peer Networking
│   │   └── synapse/           # Welford Online Variance Anomaly Detection
│   └── Cargo.toml             # Rust Dependencies
├── src/                       # Frontend (Preact + Vite)
│   ├── components/            # UI Components (Dock, Arena, Hub)
│   │   ├── ui/                # Neon/Glassmorphism Base Components
│   │   ├── dock/              # Split-pane layout engine
│   │   └── VectorGalaxyR3F.tsx# React-Three-Fiber 3D Neural Interface
│   ├── store/                 # Zustand Stores (Inference, Telemetry, Models)
│   ├── workers/               # Off-main-thread binary WebWorker decoder
│   └── hooks/                 # Custom React hooks (Lerping, IPC)
├── package.json               # Node Dependencies
└── vite.config.ts             # Vite Bundler Config
```

---

## 🧠 Managing Models

OpenLLM is deeply integrated with the `.gguf` standard (and safetensors for specific engines). 
To add models manually, place your downloaded model files into your OS's secure AppData path:
- **Windows:** `C:\Users\<User>\AppData\Roaming\openllm\models\`
- **Linux:** `~/.local/share/openllm/models/`
- **macOS:** `~/Library/Application Support/openllm/models/`

The backend `profiler` automatically parses the metadata (Magic Number, Architecture, Tensor count) upon startup to fuel the Engine Router.

---

## 🤝 Contributing

We welcome pull requests! If you're planning to introduce a new LLM backend engine:
1. Create a new struct in `src-tauri/src/engines/`.
2. Implement the `EngineAdapter` trait (`name()`, `supports()`, `spawn()`).
3. Add the engine score logic to `src-tauri/src/router/decision_tree.rs`.

---

## 📄 License

This project is licensed under the **MIT License**. See the `LICENSE` file for details.
