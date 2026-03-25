#pragma once

#include <cstddef> // For std::size_t
#include <cstdint>
#include <cstring>

namespace hft {
namespace core {

// -------------------------------------------------------------------------
// Config Constants
// -------------------------------------------------------------------------

// 1e8 multiplier supports 8 decimal places (Bitcoin Satoshi precision)
// Max value: +/- 92,233,720,368.54775807
constexpr std::int64_t PRICE_SCALE = 100'000'000;
constexpr double PRICE_SCALE_DBL = 100'000'000.0;

// 1e8 multiplier for Quantity to support fractional shares/coins
constexpr std::int64_t QTY_SCALE = 100'000'000;
constexpr double QTY_SCALE_DBL = 100'000'000.0;

// -------------------------------------------------------------------------
// Type Definitions
// -------------------------------------------------------------------------

using OrderId = std::uint64_t;
using SymbolId = std::uint32_t;

// Fixed string for symbols (No heap alloc)
struct Symbol {
  char data[16] = {0}; // e.g. "BTC-USD", "AAPL"

  constexpr Symbol() = default;

  // Constructor from C-string
  Symbol(const char *s) {
    std::size_t len = std::strlen(s);
    len = len < (sizeof(data) - 1) ? len : (sizeof(data) - 1);
    std::memcpy(data, s, len);
    data[len] = '\0';
  }

  const char *c_str() const { return data; }

  bool operator==(const Symbol &other) const {
    return std::strcmp(data, other.data) == 0;
  }
};

enum class Side : std::uint8_t { None = 0, Buy = 1, Sell = 2 };

// Helper for rounding without <math.h> or <cmath>
inline std::int64_t round_dbl(double x) {
  return static_cast<std::int64_t>(x >= 0.0 ? x + 0.5 : x - 0.5);
}

struct Price {
  std::int64_t ticks; // Representation in 1e-8 units

  constexpr Price() : ticks(0) {}
  constexpr explicit Price(std::int64_t t) : ticks(t) {}

  static Price from_float(double p) {
    return Price(round_dbl(p * PRICE_SCALE_DBL));
  }

  constexpr double to_float() const {
    return static_cast<double>(ticks) / PRICE_SCALE_DBL;
  }

  bool operator==(const Price &other) const { return ticks == other.ticks; }
  bool operator!=(const Price &other) const { return ticks != other.ticks; }
  bool operator<(const Price &other) const { return ticks < other.ticks; }
  bool operator>(const Price &other) const { return ticks > other.ticks; }
  bool operator<=(const Price &other) const { return ticks <= other.ticks; }
  bool operator>=(const Price &other) const { return ticks >= other.ticks; }

  Price operator+(Price other) const { return Price(ticks + other.ticks); }
  Price operator-(Price other) const { return Price(ticks - other.ticks); }
};

struct Quantity {
  std::int64_t amount; // Representation in 1e-8 units

  constexpr Quantity() : amount(0) {}
  constexpr explicit Quantity(std::int64_t a) : amount(a) {}

  static Quantity from_float(double q) {
    return Quantity(round_dbl(q * QTY_SCALE_DBL));
  }

  constexpr double to_float() const {
    return static_cast<double>(amount) / QTY_SCALE_DBL;
  }

  bool operator==(const Quantity &other) const {
    return amount == other.amount;
  }
  bool operator!=(const Quantity &other) const {
    return amount != other.amount;
  }
  bool operator<(const Quantity &other) const { return amount < other.amount; }
  bool operator>(const Quantity &other) const { return amount > other.amount; }
  bool operator<=(const Quantity &other) const {
    return amount <= other.amount;
  }
  bool operator>=(const Quantity &other) const {
    return amount >= other.amount;
  }

  Quantity operator+(Quantity other) const {
    return Quantity(amount + other.amount);
  }
  Quantity operator-(Quantity other) const {
    return Quantity(amount - other.amount);
  }
};

} // namespace core
} // namespace hft
