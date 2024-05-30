

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

var log = "", provider,ethersSigner,litContractClient,pkpPubkey,balanceInLit,account,pkpAddress,sessionSigs,litNodeClient;

connect()

async function connect() {
  try{
  logs("violet","Connecting...");
  const ch = LIT_CHAINS['chronicleTestnet'];
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: `0x${ch.chainId.toString(16)}`,
        rpcUrls: ch.rpcUrls,
        chainName: ch.name,
        nativeCurrency: {
          name: ch.symbol,
          symbol: (ch.symbol == 'testLPX') ? 'LIT' : ch.symbol,
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
    logs("lime","Ready!")
    } else {logs("lime","Complited!")}

  } catch (error) {
    console.error(error);
    logs("red",error.message)
  }

}


async function startClick() {
  log = "";
  
try {

  


    //api
    //https://lit-protocol.calderaexplorer.xyz/api?module=account&action=balance&address=0x8cFc0e8C1f8DFb3335e00de92D9Cb6556f841C04
   // https://lit-protocol.calderaexplorer.xyz/api?module=account&action=tokenList&address=0x8cFc0e8C1f8DFb3335e00de92D9Cb6556f841C04
   // https://lit-protocol.calderaexplorer.xyz/api?module=account&action=tokentx&address=0x8cFc0e8C1f8DFb3335e00de92D9Cb6556f841C04&contractaddress=0x58582b93d978f30b4c4e812a16a7b31c035a69f7
//https://explorer.litprotocol.com/api/get-pkps-by-address/0x8cFc0e8C1f8DFb3335e00de92D9Cb6556f841C04?network=cayenne

   if (!litNodeClient)  litNodeClient = await getLitNodeClient();

   if (!sessionSigs) {
    sessionSigs = await getSessionSigs(litNodeClient, ethersSigner);
    logs("lime","Got Session Signatures!");
   }

   


// run sender
    //const txs = [{"chain":"chronicleTestnet", "address":"0x8cFc0e8C1f8DFb3335e00de92D9Cb6556f841C04","value":"0.000001"},{"chain":"chronicleTestnet", "address":"0xA1485801Ea9d4c890BC7563Ca92d90c4ae52eC75","value":"0.000002"}]
    const txs = JSON.parse(`[${document.getElementById('txs').value}]`);
   
   //const publicKey = '0476553d5513495fc72e924fdb3bc82948cf7c8714b9743d11cd6a855f105c1fc514198051cd006bbea5e4d0179d11bac1cc4f3dc0d00ea0fbb101765918866bc9'

   for (let i = 0; i < txs.length; i++)  {
    try {
logs("violet",`Sending Tx ${i+1}...`)
    const workChain = LIT_CHAINS[txs[i].chain];
    console.log( workChain)
    const rpc = `${LIT_CHAINS[txs[i].chain].rpcUrls[0]}`;
    const workProvider = new ethers.providers.JsonRpcProvider(rpc);
    const gasPrice = await workProvider.getGasPrice();
    const nonce = await workProvider.getTransactionCount(pkpAddress);
    const value = ethers.utils.parseUnits(txs[i].value,"ether")
    const bal = await workProvider.getBalance(pkpAddress);
    if (value >= bal) {logs("orange",`The balance ${pkpAddress} is ${ethers.utils.formatEther(bal)} too low on ${workChain.name}`);
  continue
  }

    const txParams = {
      nonce: await workProvider.getTransactionCount(pkpAddress),
      gasPrice: await workProvider.getGasPrice(),
      gasLimit: ethers.utils.parseUnits("21000","wei"),
      to: txs[i].address,
      value: value,
      chainId: workChain.chainId,
    };
  
    //console.log(txParams);

    const rlpEncodedTxn = ethers.utils.arrayify(ethers.utils.serializeTransaction(txParams));

//Sign Tx within a lit action

    const litActionSignatures = await litNodeClient.executeJs({
      sessionSigs,
      code: litActionSign,
      jsParams: {
        dataToSign: ethers.utils.arrayify(
          ethers.utils.keccak256(rlpEncodedTxn)
        ),
        publicKey: pkpPubkey,//await getPkpPublicKey(ethersSigner),
        sigName: `sig${i}`,
      },
    });
    console.log("litActionSignatures: ", litActionSignatures);

    //Send Tx

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
   logs("red","Something went wrong."+e.message)
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

async function getPkpPublicKey(account) {
 //const ids = await scanpkp(account);
  //if (!nfts) nfts = await axios.get(`https://explorer.litprotocol.com/api/get-pkps-by-address/${account}?network=cayenne`);
  //if (!nfts.data.data.length) { 
  // logs('orange', "PKP not found for this account. Hit button 'Mint new PKP'")
   // if (balanceInLit < 0.000001) logs("orange", "Balance is too low. Get testnet LIT <a href='https://faucet.litprotocol.com/' target='_blank'>Faucet</a>")
  // return ""
  //}
  //const tokenId = (id) ? id : nfts.data.data[i].tokenID;
  //const pkp = await litContractClient.pkpNftContract.read.getPubkey(tokenId);
 // return {id:tokenId, key: pkp, addr: ethers.utils.computeAddress(pkp)};
}


async function mintPkp() {
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

//function getRandomColor() {
//	var x = Math.round(Math.random()*(0xffffff - 0x111111) + 0x111111).toString(16);
//	return '#' + x
//}

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
   
      refresh(newKey)
  
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
    logs("lime","Complited!")
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

//22643394743381587667658748339099971610029222951739902768542770658957559298368 