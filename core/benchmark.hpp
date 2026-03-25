#pragma once

#include "time.hpp"
#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <fstream>
#include <vector>

namespace hft {
namespace core {

// -------------------------------------------------------------------------
// Latency Histogram - Lock-free for hot path
// -------------------------------------------------------------------------

// Bucket ranges in nanoseconds: 0-100ns, 100-500ns, 500ns-1µs, 1-10µs,
// 10-100µs, 100µs-1ms, 1ms+
constexpr std::size_t NUM_BUCKETS = 7;
constexpr std::array<std::int64_t, NUM_BUCKETS> BUCKET_THRESHOLDS = {
    100,       // < 100ns
    500,       // < 500ns
    1'000,     // < 1µs
    10'000,    // < 10µs
    100'000,   // < 100µs
    1'000'000, // < 1ms
    INT64_MAX  // >= 1ms
};

constexpr std::array<const char *, NUM_BUCKETS> BUCKET_NAMES = {
    "<100ns", "<500ns", "<1us", "<10us", "<100us", "<1ms", ">=1ms"};

class LatencyHistogram {
public:
  LatencyHistogram() {
    for (auto &b : buckets_)
      b.store(0, std::memory_order_relaxed);
    count_.store(0, std::memory_order_relaxed);
    sum_.store(0, std::memory_order_relaxed);
    min_.store(INT64_MAX, std::memory_order_relaxed);
    max_.store(0, std::memory_order_relaxed);
  }

  // Record a latency sample (lock-free)
  void record(std::int64_t latency_ns) {
    // Update stats
    count_.fetch_add(1, std::memory_order_relaxed);
    sum_.fetch_add(latency_ns, std::memory_order_relaxed);

    // Update min (CAS loop)
    std::int64_t current_min = min_.load(std::memory_order_relaxed);
    while (latency_ns < current_min &&
           !min_.compare_exchange_weak(current_min, latency_ns,
                                       std::memory_order_relaxed))
      ;

    // Update max (CAS loop)
    std::int64_t current_max = max_.load(std::memory_order_relaxed);
    while (latency_ns > current_max &&
           !max_.compare_exchange_weak(current_max, latency_ns,
                                       std::memory_order_relaxed))
      ;

    // Find bucket and increment
    for (std::size_t i = 0; i < NUM_BUCKETS; ++i) {
      if (latency_ns < BUCKET_THRESHOLDS[i]) {
        buckets_[i].fetch_add(1, std::memory_order_relaxed);
        break;
      }
    }
  }

  // Get statistics
  std::int64_t count() const { return count_.load(std::memory_order_relaxed); }
  std::int64_t sum() const { return sum_.load(std::memory_order_relaxed); }
  std::int64_t min_latency() const {
    auto m = min_.load(std::memory_order_relaxed);
    return m == INT64_MAX ? 0 : m;
  }
  std::int64_t max_latency() const {
    return max_.load(std::memory_order_relaxed);
  }

  double mean() const {
    auto c = count();
    return c > 0 ? static_cast<double>(sum()) / c : 0.0;
  }

  std::int64_t bucket_count(std::size_t idx) const {
    return idx < NUM_BUCKETS ? buckets_[idx].load(std::memory_order_relaxed)
                             : 0;
  }

  void reset() {
    for (auto &b : buckets_)
      b.store(0, std::memory_order_relaxed);
    count_.store(0, std::memory_order_relaxed);
    sum_.store(0, std::memory_order_relaxed);
    min_.store(INT64_MAX, std::memory_order_relaxed);
    max_.store(0, std::memory_order_relaxed);
  }

private:
  std::array<std::atomic<std::int64_t>, NUM_BUCKETS> buckets_;
  std::atomic<std::int64_t> count_;
  std::atomic<std::int64_t> sum_;
  std::atomic<std::int64_t> min_;
  std::atomic<std::int64_t> max_;
};

// -------------------------------------------------------------------------
// Latency Tracker - Collects samples for percentile calculation
// -------------------------------------------------------------------------

template <std::size_t MaxSamples = 100000> class LatencyTracker {
public:
  LatencyTracker() : write_idx_(0) {}

  void record(std::int64_t latency_ns) {
    histogram_.record(latency_ns);

    // Store sample for percentile calculation (circular buffer)
    std::size_t idx =
        write_idx_.fetch_add(1, std::memory_order_relaxed) % MaxSamples;
    samples_[idx] = latency_ns;
  }

  // Get histogram reference
  const LatencyHistogram &histogram() const { return histogram_; }

  // Calculate percentile (requires sorting, not for hot path)
  double percentile(double p) const {
    std::size_t n =
        std::min(static_cast<std::size_t>(histogram_.count()), MaxSamples);
    if (n == 0)
      return 0.0;

    std::vector<std::int64_t> sorted(samples_.begin(), samples_.begin() + n);
    std::sort(sorted.begin(), sorted.end());

    double idx = (p / 100.0) * (n - 1);
    std::size_t lower = static_cast<std::size_t>(idx);
    std::size_t upper = std::min(lower + 1, n - 1);
    double frac = idx - lower;

    return sorted[lower] * (1.0 - frac) + sorted[upper] * frac;
  }

  double p50() const { return percentile(50.0); }
  double p95() const { return percentile(95.0); }
  double p99() const { return percentile(99.0); }
  double p999() const { return percentile(99.9); }

  // Export to JSON
  void export_json(const std::string &filename) const {
    std::ofstream f(filename);
    f << "{\n";
    f << "  \"count\": " << histogram_.count() << ",\n";
    f << "  \"min_ns\": " << histogram_.min_latency() << ",\n";
    f << "  \"max_ns\": " << histogram_.max_latency() << ",\n";
    f << "  \"mean_ns\": " << histogram_.mean() << ",\n";
    f << "  \"p50_ns\": " << p50() << ",\n";
    f << "  \"p95_ns\": " << p95() << ",\n";
    f << "  \"p99_ns\": " << p99() << ",\n";
    f << "  \"p999_ns\": " << p999() << ",\n";
    f << "  \"histogram\": {\n";
    for (std::size_t i = 0; i < NUM_BUCKETS; ++i) {
      f << "    \"" << BUCKET_NAMES[i] << "\": " << histogram_.bucket_count(i);
      if (i < NUM_BUCKETS - 1)
        f << ",";
      f << "\n";
    }
    f << "  },\n";
    f << "  \"samples\": [";
    std::size_t n =
        std::min(static_cast<std::size_t>(histogram_.count()), MaxSamples);
    for (std::size_t i = 0; i < n && i < 1000;
         ++i) { // Limit to 1000 for file size
      if (i > 0)
        f << ", ";
      f << samples_[i];
    }
    f << "]\n";
    f << "}\n";
  }

  void reset() {
    histogram_.reset();
    write_idx_.store(0, std::memory_order_relaxed);
  }

private:
  LatencyHistogram histogram_;
  std::array<std::int64_t, MaxSamples> samples_;
  std::atomic<std::size_t> write_idx_;
};

// -------------------------------------------------------------------------
// Scoped Latency Measurement (RAII)
// -------------------------------------------------------------------------

template <typename Tracker> class ScopedLatency {
public:
  explicit ScopedLatency(Tracker &tracker)
      : tracker_(tracker), start_(now_nanos()) {}

  ~ScopedLatency() { tracker_.record(now_nanos() - start_); }

  // Prevent copy/move
  ScopedLatency(const ScopedLatency &) = delete;
  ScopedLatency &operator=(const ScopedLatency &) = delete;

private:
  Tracker &tracker_;
  Timestamp start_;
};

// Convenience macro
#define HFT_MEASURE_LATENCY(tracker)                                           \
  hft::core::ScopedLatency<decltype(tracker)> _scoped_latency_##__LINE__(      \
      tracker)

} // namespace core
} // namespace hft
