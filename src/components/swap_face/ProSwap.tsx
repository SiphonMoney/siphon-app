"use client";

import { useState } from "react";

interface ProSwapProps {
  isLoaded: boolean;
  sdkInitialized: boolean;
}

interface Swap {
  from: string;
  to: string;
  amount: string;
  liquidity: string;
  transactionMode: string;
  liquidityChain: string;
}

export default function ProSwap({ isLoaded, sdkInitialized }: ProSwapProps) {
  const [depositInputs, setDepositInputs] = useState([
    { chain: "SOL", token: "SOL", amount: "" }
  ]);
  const [withdrawInstructions, setWithdrawInstructions] = useState([
    { chain: "SOL", token: "USDC", amount: "", address: "" }
  ]);
  const [swaps, setSwaps] = useState<Swap[]>([
    { 
      from: "SOL", 
      to: "USDC", 
      amount: "", 
      liquidity: "internal", 
      transactionMode: "single",
      liquidityChain: "SOL"
    }
  ]);

  const handleDeposit = () => {
    console.log(`Depositing to Siphon Vault`, depositInputs);
    // Mock deposit functionality
    alert('Deposit functionality - Mock implementation');
  };

  const handleWithdraw = () => {
    console.log('Executing withdrawals', withdrawInstructions);
    // Mock withdrawal functionality
    alert('Withdrawal functionality - Mock implementation');
  };

  const handleSwap = () => {
    console.log('Executing strategy');
    // Mock strategy execution
    alert('Strategy execution - Mock implementation');
  };

  const addSwap = () => {
    setSwaps([...swaps, { 
      from: "SOL", 
      to: "USDC", 
      amount: "", 
      liquidity: "internal", 
      transactionMode: "single",
      liquidityChain: "SOL"
    }]);
  };

  const removeSwap = (index: number) => {
    if (swaps.length > 1) {
      setSwaps(swaps.filter((_, i) => i !== index));
    }
  };

  const updateSwap = (index: number, field: string, value: string) => {
    const updatedSwaps = swaps.map((swap, i) => 
      i === index ? { ...swap, [field]: value } : swap
    );
    setSwaps(updatedSwaps);
  };

  const addDepositInput = () => {
    setDepositInputs([...depositInputs, { chain: "SOL", token: "SOL", amount: "" }]);
  };

  const removeDepositInput = (index: number) => {
    if (depositInputs.length > 1) {
      setDepositInputs(depositInputs.filter((_, i) => i !== index));
    }
  };

  const updateDepositInput = (index: number, field: string, value: string) => {
    const updatedInputs = depositInputs.map((input, i) => 
      i === index ? { ...input, [field]: value } : input
    );
    setDepositInputs(updatedInputs);
  };

  const addWithdrawInstruction = () => {
    setWithdrawInstructions([...withdrawInstructions, { chain: "SOL", token: "USDC", amount: "", address: "" }]);
  };

  const removeWithdrawInstruction = (index: number) => {
    if (withdrawInstructions.length > 1) {
      setWithdrawInstructions(withdrawInstructions.filter((_, i) => i !== index));
    }
  };

  const updateWithdrawInstruction = (index: number, field: string, value: string) => {
    const updatedInstructions = withdrawInstructions.map((instruction, i) => 
      i === index ? { ...instruction, [field]: value } : instruction
    );
    setWithdrawInstructions(updatedInstructions);
  };

  return (
    <div className={`three-columns ${isLoaded ? 'loaded' : ''}`}>
      {/* Column 1: Deposit */}
      <div className="column">
        <div className="column-header">
          <div className="step-number">1</div>
          <h3 className="step-title" data-tooltip="Deposit your tokens to the Siphon Vault. Your funds are encrypted and anonymized using zero-knowledge proofs, making your transaction history completely private. Choose your blockchain network, select the token you want to deposit, enter the amount, and review the transaction details before proceeding.">Deposit</h3>
        </div>
        
        <div className="deposit-section">
          {depositInputs.map((input, index) => (
            <div key={index} className="deposit-item">
              <div className="deposit-header">
                <span className="deposit-label">Deposit {index + 1}</span>
                {depositInputs.length > 1 && (
                  <button 
                    className="remove-deposit"
                    onClick={() => removeDepositInput(index)}
                  >
                    ×
                  </button>
                )}
              </div>
              
              <div className="deposit-input-group">
                <div className="token-input">
                  <label>Chain</label>
                  <div className="token-selector">
                    <select
                      value={input.chain}
                      onChange={(e) => updateDepositInput(index, 'chain', e.target.value)}
                    >
                      <option value="SOL">Solana</option>
                      <option value="ETH">Ethereum</option>
                      <option value="BTC">Bitcoin</option>
                    </select>
                  </div>
                </div>

                <div className="token-input">
                  <label>Token</label>
                  <div className="token-selector">
                    <select
                      value={input.token}
                      onChange={(e) => updateDepositInput(index, 'token', e.target.value)}
                    >
                      <option value="SOL">SOL</option>
                      <option value="USDC">USDC</option>
                      <option value="ETH">ETH</option>
                      <option value="ZCASH">ZCASH</option>
                      <option value="XMR">XMR</option>
                    </select>
                  </div>
                </div>

                <div className="token-input">
                  <label>Amount</label>
                  <input
                    type="number"
                    placeholder="0.0"
                    value={input.amount}
                    onChange={(e) => updateDepositInput(index, 'amount', e.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}
          
          <button className="add-deposit-button" onClick={addDepositInput}>
            + Add Deposit
          </button>
        </div>
        
        <button 
          className="action-button" 
          onClick={handleDeposit}
          disabled={!sdkInitialized}
        >
          {sdkInitialized ? 'Deposit to Vault' : 'Initialize Mock SDK First'}
        </button>
      </div>

      {/* Column 2: Strategy */}
      <div className="column">
        <div className="column-header">
          <div className="step-number">2</div>
          <h3 className="step-title" data-tooltip="Execute advanced trading strategies using Siphon Protocol&apos;s privacy-preserving infrastructure. Your trading activity is completely anonymized through zero-knowledge proofs and homomorphic encryption, ensuring no one can trace your trading patterns or identify your positions.">Strategy</h3>
        </div>
        
        <div className="strategy-section">
          {swaps.map((swap, index) => (
            <div key={index} className="swap-item">
              <div className="swap-header">
                <span className="swap-label">Swap {index + 1}</span>
                {swaps.length > 1 && (
                  <button 
                    className="remove-swap"
                    onClick={() => removeSwap(index)}
                  >
                    ×
                  </button>
                )}
              </div>
              
              <div className="swap-inputs">
                <div className="input-group">
                  <input
                    type="number"
                    placeholder="0.0"
                    value={swap.amount}
                    onChange={(e) => updateSwap(index, 'amount', e.target.value)}
                  />
                  <div className="token-selector">
                    <select
                      value={swap.from}
                      onChange={(e) => updateSwap(index, 'from', e.target.value)}
                    >
                      <option value="SOL">SOL</option>
                      <option value="USDC">USDC</option>
                      <option value="ETH">ETH</option>
                      <option value="ZCASH">ZCASH</option>
                      <option value="XMR">XMR</option>
                    </select>
                  </div>
                </div>

                <div className="swap-arrow">→</div>

                <div className="token-selector">
                  <select
                    value={swap.to}
                    onChange={(e) => updateSwap(index, 'to', e.target.value)}
                  >
                    <option value="SOL">SOL</option>
                    <option value="USDC">USDC</option>
                    <option value="ETH">ETH</option>
                    <option value="ZCASH">ZCASH</option>
                    <option value="XMR">XMR</option>
                  </select>
                </div>
              </div>

              <div className="swap-options">
                <div className="option-group">
                  <label className="option-label">
                    Liquidity Source
                    <span className="option-tooltip" data-tooltip="Internal: Uses Siphon's internal orderbook for fast, cheap execution. External: Takes liquidity from external pools for better rates.">?</span>
                  </label>
                  <div className="radio-group">
                    <label className="radio-option">
                      <input
                        type="radio"
                        name={`liquidity-${index}`}
                        value="internal"
                        checked={swap.liquidity === "internal"}
                        onChange={(e) => updateSwap(index, 'liquidity', e.target.value)}
                      />
                      <span>Internal</span>
                    </label>
                    <label className="radio-option">
                      <input
                        type="radio"
                        name={`liquidity-${index}`}
                        value="external"
                        checked={swap.liquidity === "external"}
                        onChange={(e) => updateSwap(index, 'liquidity', e.target.value)}
                      />
                      <span>External</span>
                    </label>
                  </div>
                </div>

                <div className="option-group">
                  <label className="option-label">
                    Transaction Mode
                    <span className="option-tooltip" data-tooltip="Single: Execute this swap independently. Group: Combine with other swaps for atomic execution.">?</span>
                  </label>
                  <div className="radio-group">
                    <label className="radio-option">
                      <input
                        type="radio"
                        name={`transaction-${index}`}
                        value="single"
                        checked={swap.transactionMode === "single"}
                        onChange={(e) => updateSwap(index, 'transactionMode', e.target.value)}
                      />
                      <span>Single</span>
                    </label>
                    <label className="radio-option">
                      <input
                        type="radio"
                        name={`transaction-${index}`}
                        value="group"
                        checked={swap.transactionMode === "group"}
                        onChange={(e) => updateSwap(index, 'transactionMode', e.target.value)}
                      />
                      <span>Group</span>
                    </label>
                  </div>
                </div>

                {swap.liquidity === "external" && (
                  <div className="option-group">
                    <label className="option-label">
                      Liquidity Chain
                      <span className="option-tooltip" data-tooltip="Select which blockchain network to source external liquidity from.">?</span>
                    </label>
                    <div className="token-selector">
                      <select
                        value={swap.liquidityChain}
                        onChange={(e) => updateSwap(index, 'liquidityChain', e.target.value)}
                      >
                        <option value="SOL">Solana</option>
                        <option value="ETH">Ethereum</option>
                        <option value="BTC">Bitcoin</option>
                        <option value="POLYGON">Polygon</option>
                        <option value="ARBITRUM">Arbitrum</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div className="swap-preview">
                <div className="preview-row">
                  <span>Rate</span>
                  <span>1 {swap.from} = 150 {swap.to}</span>
                </div>
                <div className="preview-row">
                  <span>Slippage</span>
                  <span>{swap.liquidity === "internal" ? "0.1%" : "0.5%"}</span>
                </div>
                <div className="preview-row">
                  <span>Fee</span>
                  <span>{swap.liquidity === "internal" ? "0.05%" : "0.3%"}</span>
                </div>
              </div>
            </div>
          ))}
          
          <button className="add-swap-button" onClick={addSwap}>
            + Add Swap
          </button>
        </div>
        
        <button 
          className="action-button" 
          onClick={handleSwap}
          disabled={!sdkInitialized}
        >
          {sdkInitialized ? 'Execute Strategy' : 'Initialize Mock SDK First'}
        </button>
      </div>

      {/* Column 3: Withdraw */}
      <div className="column">
        <div className="column-header">
          <div className="step-number">3</div>
          <h3 className="step-title" data-tooltip="Withdraw your tokens to any wallet address. The withdrawal process uses advanced privacy techniques to break the transaction trail, ensuring your funds cannot be traced back to their original source. Configure multiple withdrawal outputs to different wallet addresses. Specify the exact amount and token for each output, enabling complex distribution strategies.">Withdraw</h3>
        </div>
        
        <div className="withdraw-section">
          {withdrawInstructions.map((instruction, index) => (
            <div key={index} className="withdraw-item">
              <div className="withdraw-header">
                <span className="withdraw-label">Output {index + 1}</span>
                {withdrawInstructions.length > 1 && (
                  <button 
                    className="remove-withdraw"
                    onClick={() => removeWithdrawInstruction(index)}
                  >
                    ×
                  </button>
                )}
              </div>
              
              <div className="withdraw-inputs">
                <div className="withdraw-input-group">
                  <div className="token-input">
                    <label>Chain</label>
                    <div className="token-selector">
                      <select
                        value={instruction.chain}
                        onChange={(e) => updateWithdrawInstruction(index, 'chain', e.target.value)}
                      >
                        <option value="SOL">Solana</option>
                        <option value="ETH">Ethereum</option>
                        <option value="BTC">Bitcoin</option>
                      </select>
                    </div>
                  </div>

                  <div className="token-input">
                    <label>Token</label>
                    <div className="token-selector">
                      <select
                        value={instruction.token}
                        onChange={(e) => updateWithdrawInstruction(index, 'token', e.target.value)}
                      >
                        <option value="SOL">SOL</option>
                        <option value="USDC">USDC</option>
                        <option value="ETH">ETH</option>
                        <option value="ZCASH">ZCASH</option>
                        <option value="XMR">XMR</option>
                      </select>
                    </div>
                  </div>

                  <div className="token-input">
                    <label>Amount</label>
                    <input
                      type="number"
                      placeholder="0.0"
                      value={instruction.amount}
                      onChange={(e) => updateWithdrawInstruction(index, 'amount', e.target.value)}
                    />
                  </div>
                </div>
                
                <div className="wallet-input">
                  <label>Wallet Address</label>
                  <input
                    type="text"
                    placeholder="Enter wallet address"
                    value={instruction.address}
                    onChange={(e) => updateWithdrawInstruction(index, 'address', e.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}
          
          <button className="add-withdraw-button" onClick={addWithdrawInstruction}>
            + Add Output
          </button>
        </div>
        
        <button 
          className="action-button" 
          onClick={handleWithdraw}
          disabled={!sdkInitialized}
        >
          {sdkInitialized ? 'Execute Withdrawals' : 'Initialize Mock SDK First'}
        </button>
      </div>
    </div>
  );
}
