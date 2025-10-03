import { registerAs } from '@nestjs/config';

export default registerAs('contract', () => ({
    network: process.env.STELLAR_NETWORK || 'TESTNET',
    horizonUrl: process.env.STELLAR_HORIZON_URL,
    sorobanRpcUrl: process.env.STELLAR_SOROBAN_RPC_URL,
    networkPassphrase: process.env.STELLAR_NETWORK_PASSPHRASE,
    contractId: process.env.STELLAR_CONTRACT_ID,
    adminSecret: process.env.STELLAR_ADMIN_SECRET,
    adminPublic: process.env.STELLAR_ADMIN_PUBLIC,
    nairaTokenContractId: process.env.NAIRA_TOKEN_CONTRACT_ID,
}));