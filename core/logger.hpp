#pragma once

#include "ring_buffer.hpp"
#include "time.hpp"

#include <atomic>
#include <cstdio>
#include <cstring>
#include <ctime>
#include <fstream>
#include <iostream>
#include <thread>

// Windows defines ERROR as a macro - undefine it
#ifdef ERROR
#undef ERROR
#endif

namespace hft {
namespace core {

enum class LogLevel { DEBUG, INFO, WARN, ERROR };

// simplified fixed-size log message to avoid allocation
struct LogEntry {
  Timestamp ts;
  LogLevel level;
  char message[128]; // Fixed size message
};

class Logger {
public:
  static Logger &instance() {
    static Logger logger;
    return logger;
  }

  void init(const std::string &filename) {
    file_.open(filename, std::ios::out | std::ios::app);
    running_ = true;
    worker_ = std::thread(&Logger::process_logs, this);
  }

  void stop() {
    running_ = false;
    if (worker_.joinable())
      worker_.join();
    if (file_.is_open())
      file_.close();
  }

  // Simple log method that takes a plain string message
  void log(LogLevel level, const char *msg) {
    LogEntry entry;
    entry.ts = now_nanos();
    entry.level = level;

    std::size_t len = std::strlen(msg);
    len = len < sizeof(entry.message) - 1 ? len : sizeof(entry.message) - 1;
    std::memcpy(entry.message, msg, len);
    entry.message[len] = '\0';

    queue_.push(entry);
  }

  // Printf-style log method for formatted messages
  template <typename... Args>
  void logf(LogLevel level, const char *fmt, Args &&...args) {
    LogEntry entry;
    entry.ts = now_nanos();
    entry.level = level;

    std::snprintf(entry.message, sizeof(entry.message), fmt,
                  static_cast<Args &&>(args)...);

    queue_.push(entry);
  }

private:
  Logger() = default;
  ~Logger() { stop(); }

  void process_logs() {
    LogEntry entry;
    while (running_ || queue_.front() != nullptr) {
      while (queue_.pop(entry)) {
        // Write to file
        // Format: [TS] [LEVEL] Message
        if (file_.is_open()) {
          char ts_buf[32];
          std::time_t t = entry.ts / 1'000'000'000;
          std::strftime(ts_buf, sizeof(ts_buf), "%Y-%m-%d %H:%M:%S",
                        std::localtime(&t));

          const char *lvl_str = "INFO";
          switch (entry.level) {
          case LogLevel::DEBUG:
            lvl_str = "DEBUG";
            break;
          case LogLevel::WARN:
            lvl_str = "WARN ";
            break;
          case LogLevel::ERROR:
            lvl_str = "ERROR";
            break;
          default:
            break;
          }

          file_ << "[" << ts_buf << "." << (entry.ts % 1'000'000'000) << "] "
                << "[" << lvl_str << "] " << entry.message << "\n";
        }
      }
      std::this_thread::yield();
    }
  }

  SPSCRingBuffer<LogEntry, 4096> queue_; // 4096 entries
  std::ofstream file_;
  std::atomic<bool> running_{false};
  std::thread worker_;
};

// Helper Macros
#define LOG_INFO(...)                                                          \
  hft::core::Logger::instance().log(hft::core::LogLevel::INFO, __VA_ARGS__)
#define LOG_WARN(...)                                                          \
  hft::core::Logger::instance().log(hft::core::LogLevel::WARN, __VA_ARGS__)
#define LOG_ERROR(...)                                                         \
  hft::core::Logger::instance().log(hft::core::LogLevel::ERROR, __VA_ARGS__)

} // namespace core
} // namespace hft
