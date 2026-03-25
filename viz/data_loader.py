"""
Data loading utilities for HFT visualization.
"""

import json
import numpy as np
from pathlib import Path
from typing import Dict, Any, Tuple


def load_latency_json(filepath: str) -> Dict[str, Any]:
    """Load latency benchmark results from JSON."""
    with open(filepath, 'r') as f:
        return json.load(f)


def load_orderbook_csv(filepath: str) -> np.ndarray:
    """Load order book snapshot from CSV."""
    return np.genfromtxt(filepath, delimiter=',', skip_header=1)


def generate_demo_data() -> Dict[str, Any]:
    """Generate demo latency data for visualization testing."""
    np.random.seed(42)
    
    # Simulate realistic HFT latency distribution (bimodal)
    fast_path = np.random.exponential(500, 8000)  # Most in <1µs
    slow_path = np.random.exponential(5000, 2000)  # Some stragglers
    samples = np.concatenate([fast_path, slow_path])
    np.random.shuffle(samples)
    
    return {
        "count": len(samples),
        "min_ns": float(np.min(samples)),
        "max_ns": float(np.max(samples)),
        "mean_ns": float(np.mean(samples)),
        "p50_ns": float(np.percentile(samples, 50)),
        "p95_ns": float(np.percentile(samples, 95)),
        "p99_ns": float(np.percentile(samples, 99)),
        "p999_ns": float(np.percentile(samples, 99.9)),
        "histogram": {
            "<100ns": int(np.sum(samples < 100)),
            "<500ns": int(np.sum((samples >= 100) & (samples < 500))),
            "<1us": int(np.sum((samples >= 500) & (samples < 1000))),
            "<10us": int(np.sum((samples >= 1000) & (samples < 10000))),
            "<100us": int(np.sum((samples >= 10000) & (samples < 100000))),
            "<1ms": int(np.sum((samples >= 100000) & (samples < 1000000))),
            ">=1ms": int(np.sum(samples >= 1000000)),
        },
        "samples": samples[:1000].tolist()
    }


def generate_orderbook_surface_data(
    n_prices: int = 50,
    n_times: int = 100
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """
    Generate demo order book surface data.
    
    Returns:
        prices: Array of price levels
        times: Array of time points
        bid_depth: 2D array of bid quantities
        ask_depth: 2D array of ask quantities
    """
    np.random.seed(42)
    
    mid_price = 50000.0  # BTC-style
    spread = 10.0
    
    prices = np.linspace(mid_price - 500, mid_price + 500, n_prices)
    times = np.arange(n_times)
    
    # Create meshgrid
    T, P = np.meshgrid(times, prices)
    
    # Bid depth (higher near mid, decreasing away)
    bid_mask = P < mid_price
    bid_distance = mid_price - P
    bid_depth = np.exp(-bid_distance / 100) * (1 + 0.3 * np.sin(T / 10))
    bid_depth = bid_depth * bid_mask * np.random.uniform(0.8, 1.2, bid_depth.shape)
    
    # Ask depth (higher near mid, decreasing away)  
    ask_mask = P > mid_price
    ask_distance = P - mid_price
    ask_depth = np.exp(-ask_distance / 100) * (1 + 0.3 * np.cos(T / 10))
    ask_depth = ask_depth * ask_mask * np.random.uniform(0.8, 1.2, ask_depth.shape)
    
    return prices, times, bid_depth, ask_depth


def generate_liquidity_heatmap_data(
    n_x: int = 50,
    n_y: int = 50,
    n_frames: int = 30
) -> np.ndarray:
    """
    Generate demo liquidity heatmap data.
    
    Returns:
        3D array (frames, x, y) of liquidity values
    """
    np.random.seed(42)
    
    x = np.linspace(-1, 1, n_x)
    y = np.linspace(-1, 1, n_y)
    X, Y = np.meshgrid(x, y)
    
    frames = []
    for t in range(n_frames):
        # Moving gaussian blobs representing liquidity pools
        blob1 = np.exp(-((X - 0.3 * np.sin(t / 5))**2 + (Y - 0.3 * np.cos(t / 5))**2) / 0.1)
        blob2 = np.exp(-((X + 0.4)**2 + (Y + 0.2)**2) / 0.15) * (1 + 0.3 * np.sin(t / 3))
        blob3 = np.exp(-((X - 0.2)**2 + (Y + 0.5)**2) / 0.08)
        
        frame = blob1 + 0.7 * blob2 + 0.5 * blob3
        frame += np.random.uniform(0, 0.1, frame.shape)
        frames.append(frame)
    
    return np.array(frames)
