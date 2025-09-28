# Multi-stage build for user development containers
FROM ubuntu:22.04 AS base

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

# Install system dependencies and development tools
RUN apt-get update && apt-get install -y \
    # Basic utilities
    curl \
    wget \
    git \
    vim \
    nano \
    htop \
    unzip \
    build-essential \
    software-properties-common \
    ca-certificates \
    gnupg \
    lsb-release \
    # Development tools
    gcc \
    g++ \
    make \
    cmake \
    pkg-config \
    # Python
    python3 \
    python3-pip \
    python3-venv \
    # Network tools
    net-tools \
    iputils-ping \
    dnsutils \
    # Process management
    supervisor \
    # Clean up
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20.x
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g pnpm yarn npm@latest

# Install Docker CLI (for Docker-in-Docker scenarios)
RUN curl -fsSL https://get.docker.com | sh

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | gpg --dearmor -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install gh -y

# Install Rust (for potential future needs)
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Install Go
RUN wget https://go.dev/dl/go1.21.6.linux-amd64.tar.gz \
    && tar -C /usr/local -xzf go1.21.6.linux-amd64.tar.gz \
    && rm go1.21.6.linux-amd64.tar.gz
ENV PATH="/usr/local/go/bin:${PATH}"

# Install common Python packages
RUN pip3 install --upgrade pip \
    && pip3 install \
    pipenv \
    poetry \
    black \
    flake8 \
    mypy \
    pytest \
    requests \
    pandas \
    numpy

# Install Claude Code CLI
RUN npm install -g @anthropic/claude-code

# Install tmux for session management
RUN apt-get update && apt-get install -y tmux && apt-get clean

# Create Claude Code configuration directory
RUN mkdir -p /home/aidev/.config/claude-code

# Create tmux configuration for Claude Code sessions
COPY tmux.conf /home/aidev/.tmux.conf

# Create workspace directory
WORKDIR /workspace

# Create a non-root user for running containers (security best practice)
RUN useradd -m -s /bin/bash aidev \
    && echo "aidev:aidev" | chpasswd \
    && usermod -aG docker aidev

# Set up volume mount points
VOLUME ["/workspace", "/home/aidev/.ssh", "/home/aidev/.gitconfig"]

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD echo "Container is healthy" || exit 1

# Default command (will be overridden)
CMD ["/bin/bash"]