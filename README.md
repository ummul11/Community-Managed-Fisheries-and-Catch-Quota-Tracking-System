# 🐟 Community-Managed Fisheries and Catch Quota Tracking System

[![Stacks](https://img.shields.io/badge/Built%20with-Stacks-5546FF?style=for-the-badge&logo=stacks&logoColor=white)](https://stacks.co)
[![Clarity](https://img.shields.io/badge/Smart%20Contracts-Clarity-4B4144?style=for-the-badge)](https://clarity-lang.org)
[![Bitcoin](https://img.shields.io/badge/Secured%20by-Bitcoin-F7931A?style=for-the-badge&logo=bitcoin&logoColor=white)](https://bitcoin.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

> A decentralized, transparent, and auditable system for managing fishing quotas and tracking catches using blockchain technology

<!-- Add hero image or demo GIF here -->


## 🌊 About The Project

The Community-Managed Fisheries and Catch Quota Tracking System revolutionizes sustainable fishing practices by digitizing traditional catch share and quota systems. Built on the Stacks blockchain and secured by Bitcoin, this platform enables fishing cooperatives to manage, track, and trade their catch quotas with complete transparency and regulatory compliance.

### 🎯 Key Benefits

- **Prevent Overfishing**: Enforce total allowable catch limits through smart contracts
- **Transparent Trading**: Enable peer-to-peer marketplace for quota token exchange
- **Regulatory Compliance**: Provide auditable records for environmental authorities
- **Community Governance**: Empower fishing cooperatives with decentralized management

## 🚀 Tech Stack

| Technology | Purpose | Badge |
|------------|---------|-------|
| **Stacks** | Blockchain platform | ![Stacks](https://img.shields.io/badge/Stacks-5546FF?style=flat-square&logo=stacks&logoColor=white) |
| **Clarity** | Smart contract language | ![Clarity](https://img.shields.io/badge/Clarity-4B4144?style=flat-square) |
| **Bitcoin** | Security layer | ![Bitcoin](https://img.shields.io/badge/Bitcoin-F7931A?style=flat-square&logo=bitcoin&logoColor=white) |
| **TypeScript** | Type-safe development | ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white) |
| **Vitest** | Testing framework | ![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=flat-square&logo=vitest&logoColor=white) |
| **Clarinet** | Development environment | ![Clarinet](https://img.shields.io/badge/Clarinet-4B4144?style=flat-square) |

## ✨ Features

- ✅ **Quota Token System**: Fungible tokens representing fishing quotas
- ✅ **Smart Contract Management**: Total allowable catch enforcement
- ✅ **Token Burning Mechanism**: Quota consumption tracking
- ✅ **P2P Marketplace**: Direct quota trading between fishermen
- ✅ **Regulatory Reporting**: Transparent compliance monitoring
- ✅ **Community Governance**: Decentralized decision making
- ✅ **Bitcoin Security**: Immutable record keeping
- ✅ **Real-time Tracking**: Live quota utilization monitoring

## 🛠️ Installation

### Prerequisites

Before you begin, ensure you have the following installed:

- [Node.js](https://nodejs.org/) (v18 or higher)
- [Clarinet CLI](https://github.com/hirosystems/clarinet) (latest version)
- [Git](https://git-scm.com/)

### Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/Community-Managed-Fisheries-and-Catch-Quota-Tracking-System.git
   cd Community-Managed-Fisheries-and-Catch-Quota-Tracking-System
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Verify Clarinet installation**
   ```bash
   clarinet --version
   ```

4. **Check project configuration**
   ```bash
   clarinet check
   ```

## 🧪 Running Tests

### Run all tests
```bash
npm test
```

### Run tests with coverage and cost reports
```bash
npm run test:report
```

### Watch mode for development
```bash
npm run test:watch
```

### Using Clarinet directly
```bash
clarinet test
```

## 🔧 Development Environment

### Project Structure
```
├── contracts/          # Clarity smart contracts
├── tests/              # Unit and integration tests
├── settings/           # Network configurations
│   ├── Devnet.toml    # Development network settings
│   ├── Testnet.toml   # Test network settings
│   └── Mainnet.toml   # Production network settings
├── Clarinet.toml      # Project configuration
├── package.json       # Node.js dependencies
├── tsconfig.json      # TypeScript configuration
└── vitest.config.js   # Test configuration
```

### Network Configurations

- **Devnet**: Local development environment
- **Testnet**: Stacks testnet for testing
- **Mainnet**: Production Stacks network

## 📋 How It Works

1. **Setup Phase**: Total allowable catch is set in the smart contract
2. **Token Minting**: Corresponding quota tokens are minted and distributed
3. **Fishing Operations**: Fishermen burn tokens as they catch fish
4. **Trading**: Unused quota tokens can be traded in the marketplace
5. **Compliance**: All transactions are recorded on Bitcoin for regulatory audit

## 🤝 Contributing

We welcome contributions from the community! Please follow these steps:

### Getting Started

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. **Make your changes**
4. **Run tests**
   ```bash
   npm test
   ```
5. **Commit your changes**
   ```bash
   git commit -m 'Add amazing feature'
   ```
6. **Push to your branch**
   ```bash
   git push origin feature/amazing-feature
   ```
7. **Open a Pull Request**

### Development Guidelines

- Write clear, commented code
- Add tests for new features
- Follow existing code style
- Update documentation as needed
- Ensure all tests pass before submitting


## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- [Stacks Documentation](https://docs.stacks.co/)
- [Clarity Language Reference](https://docs.stacks.co/clarity/)
- [Clarinet Documentation](https://github.com/hirosystems/clarinet)