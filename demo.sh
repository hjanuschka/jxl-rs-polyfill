#!/bin/bash
set -e

# Start a simple Python web server to serve the demo
echo "Starting demo server at http://localhost:8000/sampler/"
echo "Press Ctrl+C to stop"

# Create a minimal index.html if it doesn't exist
if [ ! -f "sampler/index.html" ]; then
    mkdir -p sampler
    cat > sampler/index.html << EOF
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>JXL Polyfill Demo</title>
</head>
<body>
    <h1>JXL Polyfill Demo</h1>
    <p>Loading...</p>
    <script src="../dist/auto.js"></script>
</body>
</html>
EOF
fi

# Serve the current directory
python3 -m http.server 8000
