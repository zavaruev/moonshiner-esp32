cmake_minimum_required(VERSION 3.22)

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(moonshiner)

# Mirror ESP-IDF panic output into RTC memory for post-reboot HTTP diagnosis.
target_link_options(${PROJECT_NAME}.elf PRIVATE "-Wl,--wrap=esp_panic_handler")
