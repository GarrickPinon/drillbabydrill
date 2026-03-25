import pandas as pd
import matplotlib.pyplot as plt
import argparse

def plot_equity(csv_file):
    try:
        df = pd.read_csv(csv_file)
    except Exception as e:
        print(f"Error reading {csv_file}: {e}")
        return

    # Create figure with 2 subplots (Price/Position and Equity)
    fig, (ax1, ax2, ax3) = plt.subplots(3, 1, figsize=(12, 12), sharex=True)

    # 1. Price vs Mean
    ax1.plot(df['step'], df['price'], label='Market Price', color='blue', alpha=0.7)
    ax1.axhline(100.0, color='gray', linestyle='--', label='Mean (100.0)')
    ax1.set_title('Market Price (Ornstein-Uhlenbeck Process)')
    ax1.set_ylabel('Price')
    ax1.legend()
    ax1.grid(True, alpha=0.3)

    # 2. Inventory
    ax2.fill_between(df['step'], df['inventory'], color='purple', alpha=0.3)
    ax2.plot(df['step'], df['inventory'], color='purple', label='Position')
    ax2.set_title('Inventory (Position)')
    ax2.set_ylabel('Contracts')
    ax2.grid(True, alpha=0.3)

    # 3. Equity Curve
    ax3.plot(df['step'], df['equity'], label='Total Equity', color='green', linewidth=2)
    initial_equity = df['equity'].iloc[0]
    final_equity = df['equity'].iloc[-1]
    pnl = final_equity - initial_equity
    
    color = 'green' if pnl >= 0 else 'red'
    ax3.set_title(f'Equity Curve (PnL: ${pnl:+.2f})', color=color, fontweight='bold')
    ax3.set_ylabel('Equity ($)')
    ax3.set_xlabel('Simulation Step')
    ax3.grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig('equity_curve.png')
    print("Equity curve saved to equity_curve.png")
    # plt.show() # Uncomment if running interactively

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', default='equity_curve.csv')
    args = parser.parse_args()
    
    plot_equity(args.input)
