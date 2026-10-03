interface Eip1193 {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

declare global {
  interface Window {
    ethereum?: Eip1193;
  }
}

const BSC_CHAIN_ID = "0x38";

export const hasWallet = () => typeof window !== "undefined" && typeof window.ethereum !== "undefined";

/** Connect the user's own wallet and switch it to BNB Smart Chain mainnet. */
export async function connectBsc(): Promise<{ address: string; bnb: string }> {
  const eth = window.ethereum!;
  const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
  const address = accounts[0];
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BSC_CHAIN_ID }] });
  } catch (e) {
    if ((e as { code?: number }).code !== 4902) throw e;
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: BSC_CHAIN_ID,
        chainName: "BNB Smart Chain",
        nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
        rpcUrls: ["https://bsc-dataseed.binance.org/"],
        blockExplorerUrls: ["https://bscscan.com"],
      }],
    });
  }
  const balHex = (await eth.request({ method: "eth_getBalance", params: [address, "latest"] })) as string;
  return { address, bnb: (parseInt(balHex, 16) / 1e18).toFixed(4) };
}

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
