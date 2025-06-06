# Somnia Automated Swap Bot

A simple, automated Node.js script for performing token swaps on the Somnia testnet. It is designed to run continuously in the background, helping to generate transaction activity for your wallet.

## Features

- **Automated Swapping**: Runs an infinite loop of swap transactions with a configurable delay.
- **Alternating Pairs**: Automatically alternates between swapping `STT/USDT.g` and `STT/NIA` to diversify activity.
- **Dynamic Private Key**: If a `PRIVATE_KEY` is not found in the `.env` file, the script will securely prompt the user to enter it upon startup.
- **Transaction Safety**: Implements slippage tolerance and an adequate gas limit to reduce the chance of reverted transactions.
- **Simple Logging**: Provides clean, timestamped logs in the console, perfect for monitoring in a background session.

## Requirements

- [Node.js](https://nodejs.org/) (version 18.x or newer recommended)
- [npm](https://www.npmjs.com/) (usually included with Node.js)

## Setup & Installation

1.  **Download Files:**
     ```bash
    git clone https://github.com/bezicalboy/somnia-exchange-bot.git && cd somnia-exchange-bot
    ```

2.  **Install Dependencies:**
    Open your terminal in the project folder and run:
    ```bash
    npm install
    ```

3.  **Set Up Environment File:**
    Create a file named `.env` in the same directory. This file is used to store your private key and other configuration variables.

    You can leave `PRIVATE_KEY` empty if you prefer to be prompted for it every time you run the script.
    ```env
    # Your wallet's private key (optional, you will be prompted if it's empty)
    PRIVATE_KEY=
    
    # RPC URL for the Somnia Testnet
    RPC_URL_SOMNIA_TESTNET=https://dream-rpc.somnia.network/
    
    # Token Addresses on Somnia Testnet
    USDTG_ADDRESS=0xDa4FDE38bE7a2b959BF46E032ECfA21e64019b76
    NIA_ADDRESS=0xF2F773753cEbEFaF9b68b841d80C083b18C69311
    ```

## Running the Bot

You can run the bot directly or use a terminal multiplexer like `screen` to keep it running in the background after you close your terminal.

### Standard Execution

To run the bot in your active terminal session:
```bash
npm start
```
or
```bash
node index.js
```

### Background Execution (Recommended)

Using `screen` allows the script to run continuously on a server.

1.  **Start a new screen session:**
    ```bash
    screen -S swapbot
    ```

2.  **Start the bot inside the screen session:**
    ```bash
    node index.js
    ```

3.  **Detach from the session:**
    Press `Ctrl+A` followed by `d`. The bot is now running in the background.

4.  **Re-attach to the session to view logs:**
    ```bash
    screen -r swapbot
    ```
