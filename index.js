import "dotenv/config";
import { ethers } from "ethers";
import readline from 'readline';
import fs from 'fs';

// ----------------------------------------------------------------
// #region Configuration
// ----------------------------------------------------------------

let PRIVATE_KEY = process.env.PRIVATE_KEY; // Use 'let' to allow modification
const RPC_URL = process.env.RPC_URL_SOMNIA_TESTNET;
const USDTG_ADDRESS = process.env.USDTG_ADDRESS;
const NIA_ADDRESS = process.env.NIA_ADDRESS;
const ROUTER_ADDRESS = "0xb98c15a0dC1e271132e341250703c7e94c059e8D";
const WSTT_ADDRESS = "0xf22ef0085f6511f70b01a68f360dcc56261f768a";
const NETWORK_NAME = "Somnia Testnet";

// Automation Settings
const SWAPS_PER_BATCH = 30;
const DELAY_BETWEEN_SWAPS_MS = 10000; // 10 seconds

console.log(`
██╗  ██╗███████╗██╗     ██╗██╗  ██╗
██║  ██║██╔════╝██║     ██║██║  ██║
███████║█████╗  ██║     ██║███████║
██╔══██║██╔══╝  ██║     ██║╚════██║
██║  ██║███████╗███████╗███████╗██║
╚═╝  ╚═╝╚══════╝╚══════╝╚══════╝╚═╝
                                   
`);
console.log("Made by love hehe fuck off, join https://t.me/helladrops");
// ----------------------------------------------------------------
// #region ABIs and Global Variables
// ----------------------------------------------------------------

const ERC20ABI = [
  "function decimals() view returns (uint8)",
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)"
];

const ROUTER_ABI = [
  "function swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) public payable returns (uint256[])",
  "function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) public returns (uint256[])",
  "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[])"
];

let walletInfo = { address: "", balanceStt: "0.00", balanceUsdtg: "0.00", balanceNia: "0.00", points: 0, rank: 0 };
let globalWallet = null;
let provider = null;
let lastSwapDirectionSttUsdtg = "USDTG_TO_STT";
let lastSwapDirectionSttNia = "NIA_TO_STT";

// #endregion Global Variables

// ----------------------------------------------------------------
// #region Helper Functions
// ----------------------------------------------------------------

function log(message, type = "system") {
  const timestamp = new Date().toISOString();
  const cleanMessage = message.replace(/\{[^}]+\}/g, '');
  console.log(`[${timestamp}] [${type.toUpperCase()}] ${cleanMessage}`);
}

/**
 * Saves the provided private key to the .env file.
 * @param {string} privateKey The private key to save.
 */
function saveKeyToEnv(privateKey) {
    log('Saving private key to .env file for future sessions.', 'info');
    try {
        // Append the key to the .env file to avoid overwriting existing values.
        // The newline at the beginning ensures it starts on a new line.
        const contentToAppend = `\nPRIVATE_KEY=${privateKey}\n`;
        fs.appendFileSync('.env', contentToAppend);
        log('Successfully saved PRIVATE_KEY to .env file.', 'success');
    } catch (error) {
        log('Could not save private key to .env file.', 'error');
        log(error.message, 'error');
    }
}

function promptForPrivateKey() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise(resolve => {
        console.log('\x1b[33m%s\x1b[0m', 'WARNING: Your private key will be visible. Please be in a secure environment.');
        rl.question('Private key not found in .env. Please enter it now: ', (key) => {
            rl.close();
            process.stdout.write('\n'); 
            resolve(key.trim());
        });
    });
}

function getShortAddress(address) {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "N/A";
}

function getRandomNumber(min, max, decimals = 4) {
  const random = Math.random() * (max - min) + min;
  return parseFloat(random.toFixed(decimals));
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// #endregion Helper Functions

// ----------------------------------------------------------------
// #region Core Blockchain Functions
// ----------------------------------------------------------------

async function updateWalletData() {
  try {
    if (!provider) provider = new ethers.JsonRpcProvider(RPC_URL);
    if (!globalWallet) globalWallet = new ethers.Wallet(PRIVATE_KEY, provider);

    walletInfo.address = globalWallet.address;

    const sttBalance = await provider.getBalance(globalWallet.address);
    walletInfo.balanceStt = ethers.formatEther(sttBalance);
    walletInfo.balanceUsdtg = await getTokenBalance(USDTG_ADDRESS);
    walletInfo.balanceNia = await getTokenBalance(NIA_ADDRESS);

    const apiUrl = `https://api-node.somnia.exchange/api/leaderboard?wallet=${globalWallet.address}`;
    const response = await fetch(apiUrl);

    if (response.ok) {
      const data = await response.json();
      if (data.success && data.currentUser) {
        walletInfo.points = data.currentUser.points;
        walletInfo.rank = data.currentUser.rank;
      }
    } else {
       log(`Failed to fetch leaderboard data: ${response.statusText}`, "error");
    }

    log(`Wallet updated: Address: ${getShortAddress(walletInfo.address)}, STT: ${parseFloat(walletInfo.balanceStt).toFixed(4)}, USDT.g: ${parseFloat(walletInfo.balanceUsdtg).toFixed(2)}, NIA: ${parseFloat(walletInfo.balanceNia).toFixed(4)}, Points: ${walletInfo.points}, Rank: ${walletInfo.rank}`, "info");

  } catch (error) {
    if (error.message.includes("invalid private key")) {
        log("The provided private key is invalid. Please check and restart the script.", "critical");
        process.exit(1);
    }
    log(`Failed to update wallet data: ${error.message}`, "error");
  }
}

async function getTokenBalance(tokenAddress) {
  try {
    const contract = new ethers.Contract(tokenAddress, ERC20ABI, provider);
    const balance = await contract.balanceOf(globalWallet.address);
    const decimals = await contract.decimals();
    return ethers.formatUnits(balance, decimals);
  } catch (error) {
    log(`Failed to get token balance for ${tokenAddress}: ${error.message}`, "error");
    return "0";
  }
}

async function getAmountOut(amountIn, path) {
    try {
        const routerContract = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, provider);
        const amounts = await routerContract.getAmountsOut(amountIn, path);
        return amounts[amounts.length - 1];
    } catch (error) {
        log(`Failed to calculate amountOut: ${error.message}`, "error");
        return ethers.toBigInt("0");
    }
}

async function executeSwapWithNonceRetry(txFn, maxRetries = 3) {
  for (let retry = 0; retry < maxRetries; retry++) {
    try {
      const nonce = await provider.getTransactionCount(globalWallet.address, "pending");
      const tx = await txFn(nonce);
      const receipt = await tx.wait();
      if (receipt.status === 1) {
        return receipt;
      } else {
        throw new Error("Transaction reverted");
      }
    } catch (error) {
      if (error.message.includes("nonce")) {
        log(`Nonce error (attempt ${retry + 1}): ${error.message}. Retrying...`, "warning");
        if (retry === maxRetries - 1) throw new Error(`Failed after ${maxRetries} attempts: ${error.message}`);
        await delay(2000);
      } else {
        throw error;
      }
    }
  }
}

async function approveToken(tokenAddress, amount) {
  try {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20ABI, globalWallet);
    const allowance = await tokenContract.allowance(globalWallet.address, ROUTER_ADDRESS);
    const decimals = await tokenContract.decimals();
    const amountToApprove = ethers.parseUnits(amount.toString(), decimals);

    if (allowance < amountToApprove) {
      log(`Approving ${amount} of token ${tokenAddress} for router...`, "swap");
      const approvalTx = await executeSwapWithNonceRetry(async (nonce) => {
        return tokenContract.approve(ROUTER_ADDRESS, ethers.MaxUint256, { nonce });
      });
      await approvalTx.wait();
      log(`Token ${tokenAddress} approved successfully.`, "success");
    }
    return true;
  } catch (error) {
    log(`Failed to approve token ${tokenAddress}: ${error.message}`, "error");
    return false;
  }
}

async function reportTransaction() {
  try {
    const payload = { address: globalWallet.address, taskId: "make-swap" };
    const response = await fetch("https://api.somnia.exchange/api/completeTask", {
      method: "POST",
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (response.ok && data.success) {
      log(`Transaction reported successfully: +${data.data.task.actualPointsAwarded} Points`, "success");
    } else {
      log(`Failed to report transaction: ${data.error || response.statusText}`, "error");
    }
  } catch (error) {
    log(`Error reporting transaction: ${error.message}`, "error");
  }
}

// #endregion Core Blockchain Functions

// ----------------------------------------------------------------
// #region Swap Logic
// ----------------------------------------------------------------

async function autoSwapSttUsdtg() {
  try {
    const routerContract = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, globalWallet);
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
    const sttBalance = parseFloat(walletInfo.balanceStt);
    const usdtgBalance = parseFloat(walletInfo.balanceUsdtg);
    const sttAmount = getRandomNumber(0.01, 0.05, 4);
    const usdtgAmount = getRandomNumber(0.04, 0.21, 4);

    if (lastSwapDirectionSttUsdtg === "USDTG_TO_STT") {
      if (sttBalance < sttAmount) {
        log(`Insufficient STT balance for swap: ${sttBalance} < ${sttAmount}`, "warning");
        lastSwapDirectionSttUsdtg = "STT_TO_USDTG";
        return;
      }
      const amountIn = ethers.parseEther(sttAmount.toString());
      const path = [WSTT_ADDRESS, USDTG_ADDRESS];
      const amountOutMinRaw = await getAmountOut(amountIn, path);
      const amountOutMin = amountOutMinRaw * BigInt(90) / BigInt(100);

      log(`Performing swap: ${sttAmount} STT -> USDT.g (min out: ${ethers.formatUnits(amountOutMin, 6)})`, "swap");
      const receipt = await executeSwapWithNonceRetry(async (nonce) =>
        routerContract.swapExactETHForTokens(amountOutMin, path, globalWallet.address, deadline, { value: amountIn, gasLimit: 800000, nonce })
      );

      if (receipt.status === 1) {
        log(`Swap successful. Hash: ${receipt.hash}`, "success");
        await reportTransaction();
        lastSwapDirectionSttUsdtg = "STT_TO_USDTG";
      }
    } else {
      if (usdtgBalance < usdtgAmount) {
        log(`Insufficient USDT.g balance for swap: ${usdtgBalance} < ${usdtgAmount}`, "warning");
        lastSwapDirectionSttUsdtg = "USDTG_TO_STT";
        return;
      }
      const approved = await approveToken(USDTG_ADDRESS, usdtgAmount);
      if (!approved) return;
      
      const tokenContract = new ethers.Contract(USDTG_ADDRESS, ERC20ABI, globalWallet);
      const decimals = await tokenContract.decimals();
      const amountIn = ethers.parseUnits(usdtgAmount.toString(), decimals);
      const path = [USDTG_ADDRESS, WSTT_ADDRESS];
      const amountOutMinRaw = await getAmountOut(amountIn, path);
      const amountOutMin = amountOutMinRaw * BigInt(90) / BigInt(100);

      log(`Performing swap: ${usdtgAmount} USDT.g -> STT (min out: ${ethers.formatEther(amountOutMin)})`, "swap");
      const receipt = await executeSwapWithNonceRetry(async (nonce) =>
        routerContract.swapExactTokensForETH(amountIn, amountOutMin, path, globalWallet.address, deadline, { gasLimit: 800000, nonce })
      );

      if (receipt.status === 1) {
        log(`Swap successful. Hash: ${receipt.hash}`, "success");
        await reportTransaction();
        lastSwapDirectionSttUsdtg = "USDTG_TO_STT";
      }
    }
  } catch (error) {
    log(`Failed during STT/USDT.g swap: ${error.message}`, "error");
  }
}

async function autoSwapSttNia() {
    try {
        const routerContract = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, globalWallet);
        const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
        const sttBalance = parseFloat(walletInfo.balanceStt);
        const niaBalance = parseFloat(walletInfo.balanceNia);
        const sttAmount = getRandomNumber(0.01, 0.05, 4);
        const niaAmount = getRandomNumber(2, 10, 4);

        if (lastSwapDirectionSttNia === "NIA_TO_STT") {
            if (sttBalance < sttAmount) {
                log(`Insufficient STT balance for swap: ${sttBalance} < ${sttAmount}`, "warning");
                lastSwapDirectionSttNia = "STT_TO_NIA";
                return;
            }
            const amountIn = ethers.parseEther(sttAmount.toString());
            const path = [WSTT_ADDRESS, NIA_ADDRESS];
            const amountOutMinRaw = await getAmountOut(amountIn, path);
            const amountOutMin = amountOutMinRaw * BigInt(90) / BigInt(100);

            log(`Performing swap: ${sttAmount} STT -> NIA (min out: ${ethers.formatUnits(amountOutMin, 18)})`, "swap");
            const receipt = await executeSwapWithNonceRetry(async (nonce) =>
                routerContract.swapExactETHForTokens(amountOutMin, path, globalWallet.address, deadline, { value: amountIn, gasLimit: 800000, nonce })
            );

            if (receipt.status === 1) {
                log(`Swap successful. Hash: ${receipt.hash}`, "success");
                await reportTransaction();
                lastSwapDirectionSttNia = "STT_TO_NIA";
            }
        } else {
            if (niaBalance < niaAmount) {
                log(`Insufficient NIA balance for swap: ${niaBalance} < ${niaAmount}`, "warning");
                lastSwapDirectionSttNia = "NIA_TO_STT";
                return;
            }
            const approved = await approveToken(NIA_ADDRESS, niaAmount);
            if (!approved) return;

            const tokenContract = new ethers.Contract(NIA_ADDRESS, ERC20ABI, globalWallet);
            const decimals = await tokenContract.decimals();
            const amountIn = ethers.parseUnits(niaAmount.toString(), decimals);
            const path = [NIA_ADDRESS, WSTT_ADDRESS];
            const amountOutMinRaw = await getAmountOut(amountIn, path);
            const amountOutMin = amountOutMinRaw * BigInt(90) / BigInt(100);

            log(`Performing swap: ${niaAmount} NIA -> STT (min out: ${ethers.formatEther(amountOutMin)})`, "swap");
            const receipt = await executeSwapWithNonceRetry(async (nonce) =>
                routerContract.swapExactTokensForETH(amountIn, amountOutMin, path, globalWallet.address, deadline, { gasLimit: 800000, nonce })
            );

            if (receipt.status === 1) {
                log(`Swap successful. Hash: ${receipt.hash}`, "success");
                await reportTransaction();
                lastSwapDirectionSttNia = "NIA_TO_STT";
            }
        }
    } catch (error) {
        log(`Failed during STT/NIA swap: ${error.message}`, "error");
    }
}

// #endregion Swap Logic

// ----------------------------------------------------------------
// #region Main Automation Loop
// ----------------------------------------------------------------

async function main() {
  if (!PRIVATE_KEY || PRIVATE_KEY.trim() === '') {
      PRIVATE_KEY = await promptForPrivateKey();
      if (!PRIVATE_KEY || PRIVATE_KEY.trim() === '') {
          log('No private key was provided. Exiting now.', 'critical');
          process.exit(1);
      }
      saveKeyToEnv(PRIVATE_KEY);
  }

  log("Starting automated swap bot...", "info");
  log(`Bot will perform ${SWAPS_PER_BATCH} swaps with a ${DELAY_BETWEEN_SWAPS_MS / 1000} second delay, then wait for the next day.`, 'info');

  await updateWalletData();

  while (true) {
    const cycleStartTime = Date.now();
    log(`--- Starting new 24-hour cycle: Batch of ${SWAPS_PER_BATCH} swaps. ---`, 'cycle');

    for (let i = 1; i <= SWAPS_PER_BATCH; i++) {
        log(`--- Starting Swap #${i} of ${SWAPS_PER_BATCH} ---`, 'cycle');

        if (i % 2 !== 0) {
            log("Selected pair for this cycle: STT & USDT.g", "info");
            await autoSwapSttUsdtg();
        } else {
            log("Selected pair for this cycle: STT & NIA", "info");
            await autoSwapSttNia();
        }
        
        await updateWalletData();

        if (i < SWAPS_PER_BATCH) {
            const waitSeconds = DELAY_BETWEEN_SWAPS_MS / 1000;
            log(`--- Swap #${i} complete. Waiting ${waitSeconds} seconds. ---`, 'cycle');
            await delay(DELAY_BETWEEN_SWAPS_MS);
        }
    }

    log(`--- Swap batch of ${SWAPS_PER_BATCH} complete. ---`, 'cycle');
    const cycleEndTime = Date.now();
    const elapsedTime = cycleEndTime - cycleStartTime;
    const T_24_HOURS_MS = 24 * 60 * 60 * 1000;
    const timeToWait = T_24_HOURS_MS - elapsedTime;

    if (timeToWait > 0) {
        const waitHours = (timeToWait / 1000 / 60 / 60).toFixed(2);
        log(`Waiting for approximately ${waitHours} hours until the next 24-hour cycle.`, 'cycle');
        await delay(timeToWait);
    } else {
        log('Batch took longer than 24 hours to complete. Starting next cycle immediately.', 'warning');
    }
  }
}

main().catch(error => {
  log(`A critical error occurred: ${error.message}`, "critical");
  process.exit(1);
});

// #endregion Main Automation Loop
