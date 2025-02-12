import { Log } from 'ethers'
import { ethers } from 'ethers'

const CREDITS_CONTRACT_ADDRESS = '0xb3f1d3e806cf2ec822ad32c01ad64a1995b67752'
const AMOY_RPC = 'https://rpc.decentraland.org/amoy'

const ABI = [
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "_creditSignature",
        "type": "bytes32"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "consumeCredit",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
]

async function main() {
  // You'll need to provide a private key with some AMOY ETH
  const PRIVATE_KEY = process.env.PRIVATE_KEY
  if (!PRIVATE_KEY) {
    throw new Error('Please set PRIVATE_KEY in your environment')
  }

  const provider = new ethers.JsonRpcProvider(AMOY_RPC)
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider)
  const contract = new ethers.Contract(CREDITS_CONTRACT_ADDRESS, ABI, wallet)

  // Create a test credit signature (this would normally come from your credits server)
  const testCredit = "Test credit " + Date.now()
  const creditSignature = ethers.keccak256(ethers.toUtf8Bytes(testCredit))
  const amount = ethers.parseUnits("100", 18) // 100 credits

  console.log('Sending transaction...')
  console.log('Credit Signature:', creditSignature)
  console.log('Amount:', amount.toString())

  const tx = await contract.consumeCredit(creditSignature, amount)
  console.log('Transaction sent:', tx.hash)
  
  const receipt = await tx.wait()
  console.log('Transaction confirmed in block:', receipt.blockNumber)

  // Find and decode the CreditSpent event
  const creditSpentEvent = receipt.logs.find(
    (log: Log) => log.topics[0] === ethers.id("CreditSpent(bytes32,address,uint256)")
  )

  if (creditSpentEvent) {
    const iface = new ethers.Interface([
      "event CreditSpent(bytes32 indexed _creditId, address indexed beneficiary, uint256 amount)"
    ])
    const decodedEvent = iface.parseLog({
      topics: creditSpentEvent.topics,
      data: creditSpentEvent.data
    })

    if (decodedEvent) {
      console.log('Event decoded:', {
        creditId: decodedEvent.args[0], // _creditId
        beneficiary: decodedEvent.args[1], // beneficiary
        amount: decodedEvent.args[2].toString() // amount
      })
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  }) 