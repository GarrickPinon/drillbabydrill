#pragma once

#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <new>
#include <type_traits>
#include <vector>

namespace hft {
namespace core {

#ifdef __cpp_lib_hardware_interference_size
using std::hardware_constructive_interference_size;
using std::hardware_destructive_interference_size;
#else
// 64 bytes is a safe bet for most x86_64
constexpr std::size_t hardware_constructive_interference_size = 64;
constexpr std::size_t hardware_destructive_interference_size = 64;
#endif

template <typename T, std::size_t Capacity> class SPSCRingBuffer {
  static_assert((Capacity & (Capacity - 1)) == 0,
                "Capacity must be a power of 2");

public:
  SPSCRingBuffer() : head_(0), tail_(0) {}

  // Enqueue: Only called by Producer
  bool push(const T &item) {
    const std::size_t head = head_.load(std::memory_order_relaxed);
    const std::size_t next_head = (head + 1) & (Capacity - 1);

    if (next_head == tail_.load(std::memory_order_acquire)) {
      return false; // Full
    }

    buffer_[head] = item;
    head_.store(next_head, std::memory_order_release);
    return true;
  }

  // Dequeue: Only called by Consumer
  bool pop(T &item) {
    const std::size_t tail = tail_.load(std::memory_order_relaxed);

    if (tail == head_.load(std::memory_order_acquire)) {
      return false; // Empty
    }

    item = buffer_[tail];
    tail_.store((tail + 1) & (Capacity - 1), std::memory_order_release);
    return true;
  }

  // Zero-copy consume: Returns pointer to item if available, else nullptr.
  // Consumer must call advance() after processing.
  const T *front() const {
    const std::size_t tail = tail_.load(std::memory_order_relaxed);
    if (tail == head_.load(std::memory_order_acquire)) {
      return nullptr;
    }
    return &buffer_[tail];
  }

  void advance() {
    const std::size_t tail = tail_.load(std::memory_order_relaxed);
    tail_.store((tail + 1) & (Capacity - 1), std::memory_order_release);
  }

private:
  alignas(
      hardware_destructive_interference_size) std::atomic<std::size_t> head_;
  alignas(
      hardware_destructive_interference_size) std::atomic<std::size_t> tail_;
  alignas(
      hardware_destructive_interference_size) std::array<T, Capacity> buffer_;
};

} // namespace core
} // namespace hft
