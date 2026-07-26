const cfg = window.LOTTO_CONFIG;
const abi = [
  "function owner() view returns (address)",
  "function ticketPrice() view returns (uint256)",
  "function roundId() view returns (uint256)",
  "function currentPot() view returns (uint256)",
  "function entriesCount() view returns (uint256)",
  "function pendingWithdrawals(address) view returns (uint256)",
  "function winners(uint256) view returns (address)",
  "function buyTickets(uint256 quantity) payable",
  "function drawWinner()",
  "function withdraw()",
  "event TicketsPurchased(uint256 indexed roundId,address indexed buyer,uint256 quantity,uint256 paid)",
  "event WinnerDrawn(uint256 indexed roundId,address indexed winner,uint256 prize,uint256 fee)"
];

const el = id => document.getElementById(id);
const ui = {
  connect: el("connectButton"), network: el("networkBadge"), quantity: el("quantity"),
  minus: el("minusButton"), plus: el("plusButton"), buy: el("buyButton"), draw: el("drawButton"),
  claim: el("claimButton"), pot: el("potValue"), tickets: el("ticketCount"), price: el("ticketPrice"),
  round: el("roundId"), total: el("totalCost"), winner: el("winnerValue"), log: el("activityLog"), toast: el("toast")
};

let provider, signer, contract, account = "";
let ticketPriceWei = ethers.parseEther(cfg.DEFAULT_TICKET_PRICE_ETH);
let demo = { pot: 0, tickets: 0, round: 1, winner: "", balances: new Map() };

function short(address){ return address ? `${address.slice(0,6)}…${address.slice(-4)}` : ""; }
function formatEth(value){ return `${Number(ethers.formatEther(value)).toFixed(4)} ETH`; }
function writeLog(message){ const p=document.createElement("p"); p.innerHTML=`<i>›</i> ${message}`; ui.log.prepend(p); }
function toast(message){ ui.toast.textContent=message; ui.toast.classList.add("show"); setTimeout(()=>ui.toast.classList.remove("show"),2800); }
function qty(){ return Math.max(1,Math.min(25,Number(ui.quantity.value)||1)); }
function updateTotal(){ ui.quantity.value=qty(); ui.total.textContent=formatEth(ticketPriceWei*BigInt(qty())); }

async function ensureSepolia(){
  const current = await window.ethereum.request({method:"eth_chainId"});
  if(current === cfg.CHAIN_ID_HEX) return;
  try{ await window.ethereum.request({method:"wallet_switchEthereumChain",params:[{chainId:cfg.CHAIN_ID_HEX}]}); }
  catch(error){
    if(error.code !== 4902) throw error;
    await window.ethereum.request({method:"wallet_addEthereumChain",params:[{
      chainId:cfg.CHAIN_ID_HEX,chainName:cfg.CHAIN_NAME,nativeCurrency:{name:"Sepolia ETH",symbol:"ETH",decimals:18},rpcUrls:[cfg.RPC_URL],blockExplorerUrls:[cfg.EXPLORER_URL]
    }]});
  }
}

async function connectWallet(){
  if(!window.ethereum){ toast("MetaMask не найден. Установи расширение или открой сайт во встроенном браузере кошелька."); return; }
  try{
    await ensureSepolia();
    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts",[]);
    signer = await provider.getSigner();
    account = await signer.getAddress();
    ui.connect.textContent=short(account);
    ui.network.textContent = cfg.DEMO_MODE ? "SEPOLIA · DEMO" : "SEPOLIA · LIVE";
    ui.network.classList.remove("warning");
    if(!cfg.DEMO_MODE && ethers.isAddress(cfg.CONTRACT_ADDRESS)) contract = new ethers.Contract(cfg.CONTRACT_ADDRESS,abi,signer);
    writeLog(`Кошелёк подключён: ${short(account)}.`);
    toast("Кошелёк подключён к Sepolia");
    await refresh();
  }catch(error){ console.error(error); toast(error.shortMessage || error.message || "Не удалось подключить кошелёк"); }
}

async function refresh(){
  if(cfg.DEMO_MODE){
    ui.pot.textContent=`${demo.pot.toFixed(3)} ETH`; ui.tickets.textContent=demo.tickets; ui.round.textContent=`#${demo.round}`;
    ui.winner.textContent=demo.winner ? short(demo.winner) : "Пока нет"; updateTotal(); return;
  }
  if(!contract) return;
  try{
    const [price,pot,count,round] = await Promise.all([contract.ticketPrice(),contract.currentPot(),contract.entriesCount(),contract.roundId()]);
    ticketPriceWei=price; ui.price.textContent=formatEth(price); ui.pot.textContent=formatEth(pot); ui.tickets.textContent=count.toString(); ui.round.textContent=`#${round}`;
    if(round>1n){ const winner=await contract.winners(round-1n); ui.winner.textContent=short(winner); }
    updateTotal();
  }catch(error){ console.error(error); writeLog(`Ошибка чтения контракта: ${error.shortMessage||error.message}`); }
}

async function buyTickets(){
  if(!account){ await connectWallet(); if(!account) return; }
  const quantity=qty();
  if(cfg.DEMO_MODE){
    demo.tickets+=quantity; demo.pot+=Number(cfg.DEFAULT_TICKET_PRICE_ETH)*quantity;
    writeLog(`DEMO: ${short(account)} купил ${quantity} билет(а).`); toast("Демо-билеты куплены"); refresh(); return;
  }
  try{
    ui.buy.disabled=true; ui.buy.textContent="Подтверди в кошельке…";
    const tx=await contract.buyTickets(quantity,{value:ticketPriceWei*BigInt(quantity)});
    writeLog(`Покупка отправлена: <a href="${cfg.EXPLORER_URL}/tx/${tx.hash}" target="_blank">${short(tx.hash)}</a>`);
    await tx.wait(); toast("Билеты записаны в блокчейн"); await refresh();
  }catch(error){ console.error(error); toast(error.shortMessage||"Транзакция отменена"); }
  finally{ ui.buy.disabled=false; ui.buy.textContent="Купить за test ETH"; }
}

async function drawWinner(){
  if(!account){ await connectWallet(); if(!account) return; }
  if(cfg.DEMO_MODE){
    if(demo.tickets<2){ toast("Для демо-розыгрыша нужно минимум 2 билета"); return; }
    const pool=[account,"0x7a21B2f30D39C988132A78A822F81042B33fC6A1","0x3191fD14428eB832C9dEcF85A740F6B925827B3c"];
    demo.winner=pool[Math.floor(Math.random()*pool.length)];
    const prize=demo.pot*.95; demo.balances.set(demo.winner,(demo.balances.get(demo.winner)||0)+prize);
    writeLog(`DEMO: победитель раунда #${demo.round} — ${short(demo.winner)}, приз ${prize.toFixed(4)} ETH.`);
    demo.round++; demo.pot=0; demo.tickets=0; toast("Демо-розыгрыш завершён"); refresh(); return;
  }
  try{
    ui.draw.disabled=true; const owner=await contract.owner();
    if(owner.toLowerCase()!==account.toLowerCase()){ toast("Розыгрыш может вызвать только владелец контракта"); return; }
    const tx=await contract.drawWinner(); writeLog(`Розыгрыш отправлен: ${short(tx.hash)}`); await tx.wait(); toast("Победитель выбран"); await refresh();
  }catch(error){ console.error(error); toast(error.shortMessage||"Розыгрыш не выполнен"); }
  finally{ ui.draw.disabled=false; }
}

async function claim(){
  if(!account){ await connectWallet(); if(!account) return; }
  if(cfg.DEMO_MODE){
    const amount=demo.balances.get(account)||0;
    if(!amount){ toast("Для этого адреса нет демо-выигрыша"); return; }
    demo.balances.set(account,0); writeLog(`DEMO: ${short(account)} забрал ${amount.toFixed(4)} ETH.`); toast("Демо-выигрыш получен"); return;
  }
  try{
    const pending=await contract.pendingWithdrawals(account); if(pending===0n){ toast("Нет доступного выигрыша"); return; }
    const tx=await contract.withdraw(); writeLog(`Вывод отправлен: ${short(tx.hash)}`); await tx.wait(); toast("Выигрыш отправлен в кошелёк");
  }catch(error){ console.error(error); toast(error.shortMessage||"Не удалось вывести выигрыш"); }
}

ui.connect.addEventListener("click",connectWallet); ui.buy.addEventListener("click",buyTickets); ui.draw.addEventListener("click",drawWinner); ui.claim.addEventListener("click",claim);
ui.minus.addEventListener("click",()=>{ui.quantity.value=qty()-1;updateTotal()}); ui.plus.addEventListener("click",()=>{ui.quantity.value=qty()+1;updateTotal()}); ui.quantity.addEventListener("input",updateTotal);
if(window.ethereum){ window.ethereum.on?.("accountsChanged",()=>location.reload()); window.ethereum.on?.("chainChanged",()=>location.reload()); }
updateTotal(); refresh();