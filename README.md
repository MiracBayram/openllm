# OpenLLM (The Apex Architecture)

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Rust](https://img.shields.io/badge/Rust-1.80%2B-orange.svg)
![Tauri](https://img.shields.io/badge/Tauri-2.0-yellow.svg)
![Preact](https://img.shields.io/badge/Preact-10.x-673ab7.svg)

A brutally optimized, zero-copy Local LLM engine built with Rust and Tauri. OpenLLM dynamically adapts across 6 different AI inference engines, utilizing a `memmap2`-backed token ring buffer, custom binary WebSocket IPC, UDP multicast hardware swarm, and a dynamic WebGL Neural UX. Pure bare-metal performance.

## 🚀 Key Features

- **Apex Inference Router:** Dynamically routes between 6 different engines (llama.cpp, vLLM, LMDeploy, PowerInfer-2, etc.) based on available VRAM and hardware profiling.
- **Zero-Copy Memory Mapping:** Uses `memmap2` to share token arrays between the Rust backend and Tauri frontend without serialization overhead.
- **Binary WebSocket IPC:** Ultra-low latency telemetry and hardware monitoring (at ~60Hz) pushed via raw binary frames.
- **Hardware Swarm (P2P):** UDP multicast discovery for distributing AI workloads across multiple machines on the local network.
- **WebGL Neural UX:** A React-Three-Fiber powered 3D interface that reacts to LLM generation vectors in real-time.
- **Concurrency Storage:** `r2d2` + SQLite in WAL mode for unblockable parallel reads/writes.

---

## 💻 Prerequisites & Setup

Before installing, ensure you have **Node.js (v18+)** and **Rust** installed on your system.
- Install Node.js: [nodejs.org](https://nodejs.org)
- Install Rust: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`

### 🐧 Linux (Ubuntu/Debian)
Linux requires specific system libraries for Tauri to render the window correctly.

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

### 🪟 Windows
Windows requires the Microsoft C++ Build Tools to compile the Rust backend.

1. Download and install [Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/).
2. During installation, make sure **"Desktop development with C++"** is selected.
3. Install WebView2 runtime (usually pre-installed on Windows 11).

### 🍎 macOS
macOS requires the Xcode Command Line Tools.

```bash
xcode-select --install
```

---

## 🛠️ Installation & Execution

Once your OS prerequisites are installed, you can build and run the project:

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/openllm.git
cd openllm

# 2. Install Node dependencies
npm install

# 3. Start the application in Developer Mode
# Note: The first run will take a few minutes as Cargo compiles the Rust backend.
npm run tauri dev
```

To build a standalone executable for production:
```bash
npm run tauri build
```

---

## 📚 Documentation

### Architecture Overview
The project is split into two massive pillars:
1. **`src-tauri/src/` (Rust Backend):** Contains the `process` daemon, `synapse` telemetry loop, `swarm` UDP listener, and `engines` router. The central command pattern operates asynchronously via Tokio.
2. **`src/` (Preact + Vite Frontend):** Houses the `VectorGalaxyR3F.tsx` for the 3D Neural UX, Zustand stores for IPC synchronization, and Web Workers (`ipc.worker.ts`) for decoding binary streams off the main thread.

### Adding New LLM Models
Place your downloaded `.gguf` files inside the OS-specific AppData directory (e.g., `~/.local/share/openllm/models/` on Linux). The App will automatically detect them, read their magic numbers, and profile them for the Engine Router.

---

## 📜 License
MIT License.
