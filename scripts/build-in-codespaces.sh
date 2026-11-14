# GitHub Codespaces Build Script
# Run this in Codespaces to build the WASM without local toolchain

#!/bin/bash
set -e

echo "=== TrustLock WASM Build in Codespaces ==="
echo ""

# Install Rust if not present
if ! command -v rustc &> /dev/null; then
    echo "Installing Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source $HOME/.cargo/env
fi

# Add wasm target
echo "Adding wasm32 target..."
rustup target add wasm32-unknown-unknown

# Build contract
echo "Building contract..."
cd contract
cargo build --release --target wasm32-unknown-unknown

# Verify output
WASM_PATH="../target/wasm32-unknown-unknown/release/trustlock.wasm"
if [ -f "$WASM_PATH" ]; then
    echo ""
    echo "✅ Build successful!"
    echo "WASM file: $WASM_PATH"
    echo "Size: $(ls -lh $WASM_PATH | awk '{print $5}')"
    echo ""
    echo "=== Next Steps ==="
    echo "1. Download the WASM file to your PC"
    echo "2. Run: scp codespace@...:~/trustlock/target/wasm32-unknown-unknown/release/trustlock.wasm ."
    echo "   Or use VS Code: Right-click file → Download"
    echo "3. Deploy locally: near deploy trustlock-v2-timi.testnet trustlock.wasm"
else
    echo "❌ Build failed - WASM file not found"
    exit 1
fi
