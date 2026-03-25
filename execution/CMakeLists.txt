add_library(execution INTERFACE)
target_link_libraries(execution INTERFACE core data)
target_include_directories(execution INTERFACE ${CMAKE_CURRENT_SOURCE_DIR})
