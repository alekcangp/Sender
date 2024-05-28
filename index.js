import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { LitNetwork, LIT_CHAINS} from "@lit-protocol/constants";
import {
  createSiweMessageWithRecaps,
  generateAuthSig,
  LitAbility,
  LitActionResource,
  LitPKPResource,
} from "@lit-protocol/auth-helpers";
import { disconnectWeb3 } from "@lit-protocol/auth-browser";
import { LitContracts } from "@lit-protocol/contracts-sdk";
import * as ethers from "ethers";
import { litActionSign } from "./litAction";
console.log(LIT_CHAINS['sepolia'])

const PKP_PUBLIC_KEY = process.env.PKP_PUBLIC_KEY;

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("myButton").addEventListener("click", buttonClick);
});

async function buttonClick() {
  try {
    console.log("Clicked");

    const provider = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    const ethersSigner = provider.getSigner();
    const account = await ethersSigner.getAddress();
    console.log("Connected account:", account);
    const litProvider = new ethers.providers.JsonRpcProvider(LIT_CHAINS['chronicleTestnet']);

/*
    //api
    //https://lit-protocol.calderaexplorer.xyz/api?module=account&action=balance&address=0x8cFc0e8C1f8DFb3335e00de92D9Cb6556f841C04
   // https://lit-protocol.calderaexplorer.xyz/api?module=account&action=tokenList&address=0x8cFc0e8C1f8DFb3335e00de92D9Cb6556f841C04
   // https://lit-protocol.calderaexplorer.xyz/api?module=account&action=tokentx&address=0x8cFc0e8C1f8DFb3335e00de92D9Cb6556f841C04&contractaddress=0x58582b93d978f30b4c4e812a16a7b31c035a69f7
https://explorer.litprotocol.com/api/get-pkps-by-address/0x8cFc0e8C1f8DFb3335e00de92D9Cb6556f841C04?network=cayenne

// ==================== LitContracts Setup ====================
const contractClient = new LitContracts({
  provider: litProvider,
});
await contractClient.connect();

// ==================== Test Logic ====================
const pkpAddress = await contractClient.pkpNftContract.read.getEthAddress('32083458941883779049872669842691641969632420515028376542249852682112709916075');
console.log(pkpAddress);

address: ethers.utils.computeAddress(publicKey),
const pkpPubkey = await contractClient.pkpNftContract.read.getPubkey('32083458941883779049872669842691641969632420515028376542249852682112709916075');
console.log(pkpPubkey);
return
*/
    const litNodeClient = await getLitNodeClient();

    const sessionSigs = await getSessionSigs(litNodeClient, ethersSigner);
    console.log("Got Session Signatures!");


// run sender
    const txs = [{"chain":"chronicleTestnet", "address":"0x8cFc0e8C1f8DFb3335e00de92D9Cb6556f841C04","value":"0.000001"},{"chain":"chronicleTestnet", "address":"0xA1485801Ea9d4c890BC7563Ca92d90c4ae52eC75","value":"0.000002"}]//document.getElementById('txs').value.split('},');
    //console.log(txs);

   const publicKey = '0476553d5513495fc72e924fdb3bc82948cf7c8714b9743d11cd6a855f105c1fc514198051cd006bbea5e4d0179d11bac1cc4f3dc0d00ea0fbb101765918866bc9'

   for (let i = 0; i < txs.length; i++)  {
//console.log(val);
    const workChain = LIT_CHAINS[txs[i].chain];
   // const rpc = LIT_CHAINS[txs[i].chain].rpcUrls[0];
    const workProvider = new ethers.providers.JsonRpcProvider(workChain.rpcUrls[0]);
   // const gasPrice = await workProvider.getGasPrice();
   // const pkpAddress = ethers.utils.computeAddress(`0x${publicKey}`);
   // const nonce = await workProvider.getTransactionCount(pkpAddress);

    const txParams = {
      nonce: await workProvider.getTransactionCount( ethers.utils.computeAddress(`0x${publicKey}`)),
      gasPrice: await workProvider.getGasPrice(),//"0x0f4240", //
      gasLimit: ethers.utils.parseUnits("21000","wei"),
      to: txs[i].address,
      value: ethers.utils.parseUnits(txs[i].value,"ether"),
      chainId: workChain.chainId,
    };
  
    console.log(txParams);

    const rlpEncodedTxn = ethers.utils.arrayify(ethers.utils.serializeTransaction(txParams));

//Sign Tx within a lit action

    const litActionSignatures = await litNodeClient.executeJs({
      sessionSigs,
      code: litActionSign,
      jsParams: {
        dataToSign: ethers.utils.arrayify(
          ethers.utils.keccak256(rlpEncodedTxn)
        ),
        publicKey: publicKey,//await getPkpPublicKey(ethersSigner),
        sigName: `sig${i}`,
      },
    });
    console.log("litActionSignatures: ", litActionSignatures);

    //Send Tx

   const signedTx = ethers.utils.serializeTransaction(txParams, litActionSignatures.signatures[`sig${i}`].signature);
   const tx = await workProvider.sendTransaction(signedTx);
   console.log(workChain.blockExplorerUrls[0] + "tx/" + tx.hash); 

    }
  
    //verifySignature(litActionSignatures.signatures.sig);
  } catch (error) {
    console.error(error);
  } finally {
    disconnectWeb3();
  }
}


async function getLitNodeClient() {
  const litNodeClient = new LitNodeClient({
    litNetwork: LitNetwork.Cayenne,
  });

  console.log("Connecting litNodeClient to network...");
  await litNodeClient.connect();

  console.log("litNodeClient connected!");
  return litNodeClient;
}

async function getPkpPublicKey(ethersSigner) {
  if (PKP_PUBLIC_KEY !== undefined && PKP_PUBLIC_KEY !== "")
    return PKP_PUBLIC_KEY;

  const pkp = await mintPkp(ethersSigner);
  console.log("Minted PKP!", pkp);
  return pkp.publicKey;
}

async function mintPkp(ethersSigner) {
  console.log("Minting new PKP...");
  const litContracts = new LitContracts({
    signer: ethersSigner,
    network: LitNetwork.Cayenne,
  });

  await litContracts.connect();

  return (await litContracts.pkpNftContractUtils.write.mint()).pkp;
}

async function getSessionSigs(litNodeClient, ethersSigner) {
  console.log("Getting Session Signatures...");
  return litNodeClient.getSessionSigs({
    chain: "ethereum",
    expiration: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(), // 24 hours
    resourceAbilityRequests: [
      {
        resource: new LitPKPResource("*"),
        ability: LitAbility.PKPSigning,
      },
      {
        resource: new LitActionResource("*"),
        ability: LitAbility.LitActionExecution,
      },
    ],
    authNeededCallback: getAuthNeededCallback(litNodeClient, ethersSigner),
  });
}

function getAuthNeededCallback(litNodeClient, ethersSigner) {
  return async ({ resourceAbilityRequests, expiration, uri }) => {
    const toSign = await createSiweMessageWithRecaps({
      uri,
      expiration,
      resources: resourceAbilityRequests,
      walletAddress: await ethersSigner.getAddress(),
      nonce: await litNodeClient.getLatestBlockhash(),
      litNodeClient,
    });

    return await generateAuthSig({
      signer: ethersSigner,
      toSign,
    });
  };
}

function verifySignature(signature) {
  console.log("Verifying signature...");
  const dataSigned = `0x${signature.dataSigned}`;
  const encodedSig = ethers.utils.joinSignature({
    v: signature.recid,
    r: `0x${signature.r}`,
    s: `0x${signature.s}`,
  });

  const recoveredPubkey = ethers.utils.recoverPublicKey(dataSigned, encodedSig);
  console.log("Recovered uncompressed public key: ", recoveredPubkey);

  const recoveredAddress = ethers.utils.recoverAddress(dataSigned, encodedSig);
  console.log("Recovered address from signature: ", recoveredAddress);
}
