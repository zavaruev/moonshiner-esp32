/* Host-side RED/GREEN test for the pure control decisions ported from YAML.
 * Build: g++ -std=c++17 -I main tools/control_sim.cpp main/control.cpp -o /tmp/opencode/control_sim
 */
#include <cmath>
#include <cstdio>
#include <cstdlib>

#include "control.h"

static int failures = 0;

static void expect(bool ok, const char *name) {
  if (!ok) { std::printf("FAIL %s\n", name); failures++; }
  else std::printf("PASS %s\n", name);
}

static bool near(float a, float b) { return std::fabs(a - b) < 1e-4f; }

int main() {
  expect(control_should_close_valves(78.3f, 78.0f, 0.3f), "close valves at target+delta");
  expect(!control_should_close_valves(78.29f, 78.0f, 0.3f), "keep state inside hysteresis band");
  expect(control_should_open_valves(78.0f, 78.0f), "open valves at target");
  expect(!control_should_open_valves(78.1f, 78.0f), "do not open above target");

  expect(near(control_valve_level(512, 0.5f, true), 512.0f * 0.5f / 1023.0f),
         "coefficient applies to low valve");
  expect(near(control_valve_level(512, 0.5f, false), 512.0f / 1023.0f),
         "upper valve ignores coefficient");

  expect(control_pulse_interval(1023.0f, 200) == 200UL, "full level means continuous on");
  expect(control_pulse_interval(511.5f, 200) == 400UL, "pulse interval doubles at half level");

  expect(control_alarm_due(true, 1000, 6000, 5000), "alarm after 5 s overheat");
  expect(!control_alarm_due(true, 1000, 5999, 5000), "alarm debounce before 5 s");
  expect(control_watchdog_due(1000, 61000, 60000), "watchdog after 60 s");
  expect(!control_watchdog_due(1000, 60999, 60000), "watchdog before 60 s");
  expect(control_process_done(99.0f, 99.0f), "process done at max tank temp");
  expect(!control_process_done(98.9f, 99.0f), "process running below max tank temp");

  std::printf("\n%d failures\n", failures);
  return failures == 0 ? 0 : 1;
}
