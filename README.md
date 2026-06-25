<div align="center">
  <img src="https://raw.githubusercontent.com/Tauri-Apps/tauri/HEAD/app-icon.png" width="120" alt="Forge Logo">
  <h1>🌌 Forge / OpenLLM</h1>
  <p><b>The Apex Architecture: Zero-Copy, High-Performance Local AI Inference</b></p>
  
  <p>
    <a href="https://github.com/tauri-apps/tauri/releases"><img src="https://img.shields.io/badge/Tauri-v2.0-24C8C6.svg?style=for-the-badge&logo=tauri" alt="Tauri"></a>
    <a href="https://rust-lang.org"><img src="https://img.shields.io/badge/Rust-1.80+-F74C00.svg?style=for-the-badge&logo=rust" alt="Rust"></a>
    <a href="https://preactjs.com/"><img src="https://img.shields.io/badge/Preact-10.x-673ab7.svg?style=for-the-badge&logo=preact" alt="Preact"></a>
    <a href="https://vitejs.dev"><img src="https://img.shields.io/badge/Vite-5.x-646CFF.svg?style=for-the-badge&logo=vite" alt="Vite"></a>
    <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="License">
  </p>
  <p>
    <em>Windows (x64, ARM64, x86) • macOS (Universal) • Linux (AppImage, DEB, RPM)</em>
  </p>
</div>

---

## 📖 Introduction

**Forge (OpenLLM)** is a brutally optimized, bare-metal local AI inference orchestrator. It completely eliminates the bottleneck of JSON-based IPC and standard output parsing by leveraging native OS bindings and a next-generation UI architecture.

Built on **The Apex Architecture**, Forge extracts maximum performance from your hardware. Whether you're running heavily quantized models on a fanless laptop or unquantized beasts on a multi-GPU rig, Forge ensures every FLOP counts. Your data remains 100% offline and secure.

> [!NOTE]  
> **v1.0.0 Stable is now available!** We have completely revamped the build matrix, resolved cross-platform linker panics, and optimized our Preact/Rollup chunking. Download the latest binaries from the [Releases](#) tab.

---

## 🔥 Key Features

### ⚙️ Hardware-Optimized Local Inference
- **Zero-Copy Memory Mapping:** Rust and the Inference Engine share token arrays via `memmap2`. No stdout parsing overhead.
- **Dynamic Engine Router:** Automatically selects the best backend engine (e.g., `llama.cpp` for CPU/GPU, `vLLM` for PagedAttention, `MLX` for Apple Silicon) based on your hardware profile.
- **Strict CPU Affinity:** Utilizes precise `CpuSet` pinning and OOM protections to ensure the OS never throttles the AI engine.

### 🧠 Built-in Local RAG & VectorDB
- Ingest PDFs, Markdown, and TXT files directly into your local vector database.
- Chat with your private documents instantly. 
- Features a stunning **Vector Galaxy** 3D visualization using `React-Three-Fiber` and WebGL shaders to visualize your embedding clusters.

### 🎭 Dynamic AI Personas
Switch between deeply customized AI personalities on the fly. Each persona heavily morphs the UI aesthetics, syntax highlighting, and system prompts:
- 🧊 **Spectral Matrix:** High-End Tactical. Precision analytics and cold logic.
- ☢️ **Neural Decay:** Brutalist Skeuomorphism. Aggressive, chaotic, raw terminal output.
- 🏭 **Kinetic Industrial:** Hard-Tech Control. Mechanical, methodical, engineered.
- 🔮 **Solar Witch:** Esoteric, fiery. Speaks in prophecies and alien intelligence.
- 🟧 **Legacy Forge:** The classic, nostalgic, and powerful default theme.

---

## 🛠️ Automated CI/CD & Cross-Platform Support

Forge utilizes a flawless GitHub Actions matrix pipeline to deliver native binaries for almost every modern architecture.

| OS | Architectures | Installers | Status |
| :--- | :--- | :--- | :---: |
| **Windows** | `x86_64`, `ARM64`, `i686` (32-bit) | `.msi`, `.exe` (NSIS) | 🟢 Passing |
| **macOS** | `x86_64` (Intel), `aarch64` (Apple Silicon) | `.dmg` (Universal Binary) | 🟢 Passing |
| **Linux** | `x86_64` | `.AppImage`, `.deb`, `.rpm` | 🟢 Passing |

> [!TIP]  
> Linux users: We highly recommend using the `.AppImage` for a zero-configuration, double-click-to-run experience across all distributions (including Arch Linux).

---

## 🚀 Installation & Build Guide

To compile and run Forge locally from source, you must install **Node.js (v24 LTS)** and **Rust**.

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/YOUR_USERNAME/forge.git
cd forge
npm install
```

### 2. Install OS-Specific Build Tools

<details>
<summary><b>🪟 Windows</b></summary>
<br>
Building Tauri apps on Windows requires the Microsoft C++ Build Tools.
1. Install <b>Rustup</b> and <b>Node.js</b>.
2. Download the <b>Visual Studio C++ Build Tools</b>.
3. <b>CRITICAL:</b> During installation, check <b>"Desktop development with C++"</b>. Ensure you select the MSVC v143 build tools and the Windows 11 SDK.
</details>

<details>
<summary><b>🐧 Linux (Debian / Ubuntu)</b></summary>
<br>

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
    librsvg2-dev
```
</details>

<details>
<summary><b>🍎 macOS</b></summary>
<br>

```bash
xcode-select --install
# (Optional) If you experience OpenSSL errors:
brew install openssl
```
</details>

### 3. Run Development Mode
```bash
npm run tauri dev
```
*(Note: The very first run will take 3-10 minutes as Cargo downloads and compiles all Rust crates).*

### 4. Build for Production
```bash
npm run tauri build
```

---

## 📁 Architecture & Project Structure

Forge seamlessly separates a high-performance Rust backend from a dynamic, chunk-optimized Preact UI.

```text
forge/
├── .github/workflows/         # Node 24 Automated CI/CD Matrix
├── src-tauri/                 # Rust Backend (Tauri v2)
│   ├── src/
│   │   ├── engines/           # Engine Adapters (vLLM, llama.cpp, etc.)
│   │   ├── process/           # Memmap2 Token Ring Buffer & Spawner (Send-trait safe)
│   │   ├── profiler/          # GGUF Parsing & Hardware Telemetry (GPU/CPU/RAM)
│   │   ├── router/            # Smart Prompt Routing
│   │   └── server/            # Local Axum API (CORS secure)
│   ├── Cargo.toml             # Rust Dependencies (LTO optimized)
│   └── tauri.conf.json        # Tauri configuration
├── src/                       # Frontend (Preact + Vite + Tailwind)
│   ├── components/            # UI Components (Glassmorphism, Dialogs)
│   ├── store/                 # Zustand Stores (Statically imported to avoid chunk errors)
│   └── App.tsx                # Main Router
├── package.json               # Node Dependencies
└── vite.config.ts             # Vite Bundler Config (Rollup manualChunks)
```

---

## 🤝 Contributing

We welcome pull requests! To ensure code quality:
1. Ensure your Rust code is free of warnings and does not hold `!Send` variables (like Windows `HANDLE`) across `tokio::select!` await boundaries.
2. Maintain chunk size optimizations in `vite.config.ts` if adding heavy frontend dependencies.
3. Keep the UI aesthetic "premium" and dark-mode first.

---

## 📄 License

This project is licensed under the **MIT License**. See the `LICENSE` file for details.
