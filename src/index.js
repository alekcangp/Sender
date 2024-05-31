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
import axios from 'axios';


document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("startButton").addEventListener("click", startClick);
});
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("mintButton").addEventListener("click", mintPkp);
});
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("viewButton").addEventListener("click", viewPkp);
});
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("idButton").addEventListener("click", idPkp);
});
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("test").addEventListener("click", test);
});

function test() {
  document.getElementById("txs").value = '{"chain":"ethereum", "address":"0x8cFc0e8C1f8DFb3335e00de92D9Cb6556f841C04","value":"0.000001"},{"chain":"baseSepolia", "address":"0x8cFc0e8C1f8DFb3335e00de92D9Cb6556f841C04","value":"0.000002"},{"chain":"chronicleTestnet", "address":"0xA1485801Ea9d4c890BC7563Ca92d90c4ae52eC75","value":"0.000003"}'
}

var log = "", provider,ethersSigner,litContractClient,pkpPubkey,balanceInLit,account,pkpAddress,sessionSigs,litNodeClient;

connect()

async function connect() {
  try{
  logs("violet","Connecting to MetaMask...");
  const ch = LIT_CHAINS['chronicleTestnet'];
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: `0x${ch.chainId.toString(16)}`,
        rpcUrls: ["https://chain-rpc.litprotocol.com/http"],
        chainName: ch.name,
        nativeCurrency: {
          name: ch.symbol,
          symbol: "LIT",
          decimals: ch.decimals
        },
        blockExplorerUrls: ch.blockExplorerUrls
      }]
    });

    provider = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    ethersSigner = provider.getSigner();
    account = await ethersSigner.getAddress();
    logs("aqua","Connected account: " + account);
    document.getElementById('acc').innerHTML = account;
    const balance = await provider.getBalance(account);
    balanceInLit = ethers.utils.formatEther(balance);
    document.getElementById('bal').innerHTML = `${balanceInLit} LIT`;
    logs("violet","Fetching PKP...")
    litContractClient = await getLitContractClient(ethersSigner);
    const ids = await scanPkp(1,account);
    if (ids.length) {
    pkpPubkey = ids[0].key
    pkpAddress = ids[0].addr;
    document.getElementById('pkpaddr').innerHTML = pkpAddress;
    document.getElementById('pkppub').innerHTML = pkpPubkey;
    logs("lime","Got PKP!")
    } //else {logs("lime","PKP not found for this account!")}

  } catch (error) {
    console.error(error);
    logs("red",error.message)
  }

}


async function startClick() {
  log = "";  
try {

    if (pkpPubkey == undefined) {logs("orange", "PKP is required to send transactions."); return}

   if (!litNodeClient)  litNodeClient = await getLitNodeClient();
   if (!sessionSigs) {
    sessionSigs = await getSessionSigs(litNodeClient, ethersSigner);
    logs("lime","Got Session Signatures!");
   }

   const txs = JSON.parse(`[${document.getElementById('txs').value}]`); 

   if (txs.length < 1) {logs("orange","Transactions not found. Paste transactions into textarea or hit 'test' button."); return}

   for (let i = 0; i < txs.length; i++)  {
    try {
    
    const workChain = LIT_CHAINS[txs[i].chain];
    logs("violet",`Sending ${txs[i].value} to ${txs[i].address} on ${workChain.name}...`)
    const rpc = `${LIT_CHAINS[txs[i].chain].rpcUrls[0]}`;
    const workProvider = new ethers.providers.JsonRpcProvider(rpc);
    const gasLimit = "0x5208";//
    const gasPrice = await workProvider.getGasPrice();
    const nonce = await workProvider.getTransactionCount(pkpAddress);
    const value = ethers.utils.parseUnits(txs[i].value,"ether");
    const bal = await workProvider.getBalance(pkpAddress);
    if ((ethers.BigNumber.from(value).add(ethers.BigNumber.from(gasPrice).mul(ethers.BigNumber.from(gasLimit)))).gt(ethers.BigNumber.from(bal))) {
      logs("orange",`The balance ${pkpAddress} is ${ethers.utils.formatEther(bal)} too low.`);
      continue
  }

    const txParams = {
      nonce: nonce,
      gasPrice: gasPrice,
      gasLimit: gasLimit,
      to: txs[i].address,
      value: value,
      chainId: workChain.chainId,
    };

    const rlpEncodedTxn = ethers.utils.arrayify(ethers.utils.serializeTransaction(txParams));

//Sign Tx within a lit action

    const litActionSignatures = await litNodeClient.executeJs({
      sessionSigs,
      code: litActionSign,
      jsParams: {
        dataToSign: ethers.utils.arrayify(
          ethers.utils.keccak256(rlpEncodedTxn)
        ),
        publicKey: pkpPubkey,
        sigName: `sig${i}`,
      },
    });
    console.log("litActionSignatures: ", litActionSignatures);

   const signedTx = ethers.utils.serializeTransaction(txParams, litActionSignatures.signatures[`sig${i}`].signature);
   const tx = await workProvider.sendTransaction(signedTx);
   logs("lime",`Success! TxHash ${i+1}: <a href="${workChain.blockExplorerUrls[0]}tx/${tx.hash}" target="_blank">${tx.hash}</a>`); 

  } catch(e) {
    console.error(e);
    logs("red","Something went wrong. "+e.message);
    continue
  }

 }

  logs("lime","Complited!")
   
  } catch (e) {
    console.error(e);
   logs("red","Something went wrong. "+e.message)
  } finally {
    disconnectWeb3();
  }
}

async function getLitContractClient(ethersSigner) {
  const litContractClient = new LitContracts({
    signer: ethersSigner,
    network: LitNetwork.Cayenne,
   });
   //logs("Connecting litContractClient to network...");
  await litContractClient.connect();

  //logs("litContractClient connected!");
  return litContractClient;
}

async function getLitNodeClient() {
  const litNodeClient = new LitNodeClient({
    litNetwork: LitNetwork.Cayenne,
  });
  logs("violet","Connecting Lit Client to network...");
  await litNodeClient.connect();
  logs("lime","Lit Client connected!");
  return litNodeClient;
}

async function mintPkp() {
  log = "";
  try {
  logs("violet","Minting new PKP...");
  const pkp = (await litContractClient.pkpNftContractUtils.write.mint()).pkp;
  console.log(pkp);
logs("aqua",`Address: <b>${pkp.ethAddress}</b><br>PubKey: 0x${pkp.publicKey}<br>NFTID: ${pkp.tokenId}`)
  refresh("0x"+pkp.publicKey)
  }
 catch (error) {
  console.error(error);
  logs("red",error.message)
}
}

async function getSessionSigs(litNodeClient, ethersSigner) {
  logs("violet","Getting Session Signatures...");
  return litNodeClient.getSessionSigs({
    chain: "chronicleTestnet",
    uri: "qqqq",
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

function logs(c,t){
  log += `<span style='color:${c}'>${t}</span><br>`;
   document.getElementById('log').innerHTML = log;
} 

async function viewPkp() {
  log = "";
  logs("violet", "Scanning account for PKP...")
  const ids = await scanPkp(100,account)
  for (var i=0; i < ids.length; i++) {
    logs("aqua",`Address: <b>${ids[i].addr}</b><br>PubKey: ${ids[i].key}<br>NFTID: ${ids[i].id}`)
  }
  logs("lime","Complited!")
}

async function idPkp() {
  log = "";
  try {
    logs("violet", "Importing PKP wallet...")
    const id = document.getElementById("id").value.trim();
    var newKey = "";
     if (id.length == 42) { //address
      const ids = await scanPkp(100,account)
      for (let obj of ids) {
        if (obj.addr == id) {newKey = obj.key; break} 
      }
    } else if (id.length < 132) {//nft id
      newKey = await litContractClient.pkpNftContract.read.getPubkey(id);
    } else {newKey = id}
   
      setTimeout(refresh,1000,newKey)
  
 } catch (error) {
    console.error(error);
    logs("orange","PKP not found.")
  }
}

function refresh(newKey) {
  try {
    pkpAddress = ethers.utils.computeAddress(newKey);
    pkpPubkey = newKey;
    document.getElementById('pkppub').innerHTML = pkpPubkey;
    document.getElementById('pkpaddr').innerHTML = pkpAddress;
    logs("lime","Got PKP wallet!")
  } catch (error) {
    console.error(error);
    logs("orange","PKP not found.")
  }
}

async function scanPkp(le,account) {
  const nfts = (await axios.get(`https://api.codetabs.com/v1/proxy?quest=https://explorer.litprotocol.com/api/get-pkps-by-address/${account}?network=cayenne`)).data.data;
  var ids = [];
  if (!nfts.length) { 
   logs('orange', "PKP not found for this account. Hit button 'Mint new PKP'")
    if (balanceInLit < 0.000001) logs("orange", "Balance is too low. Get testnet LIT <a href='https://faucet.litprotocol.com/' target='_blank'>Faucet</a>")
  
  } else {
  for (var i = 0; (i < nfts.length && i < le); i++ ) {
  let id = nfts[i].tokenID
  let pkp = await litContractClient.pkpNftContract.read.getPubkey(id);
   ids.push({id:id, key: pkp, addr: ethers.utils.computeAddress(pkp)})
  }
}
  return ids;
}
