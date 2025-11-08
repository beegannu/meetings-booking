import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const BASE_URL = 'http://localhost:3000';

const conflictRate = new Rate('conflicts');
const successRate = new Rate('success');
const bookingCounter = new Counter('total_bookings');
const availabilityErrors = new Counter('availability_errors');
const errorCounter = new Counter('total_errors');
const bookingResponseTime = new Trend('booking_response_time');
const availabilityResponseTime = new Trend('availability_response_time');
const dbOperationTime = new Trend('db_operation_time');

export const options = {
  stages: [
    { duration: '5s', target: 50 },
    { duration: '2s', target: 400 },
    { duration: '10s', target: 400 },
    { duration: '3s', target: 800 },
    { duration: '5s', target: 800 },
    { duration: '3s', target: 400 },
    { duration: '2s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    http_req_failed: ['rate<0.05'],
    'booking_response_time': ['p(95)<800', 'p(99)<1500'],
    'availability_response_time': ['p(95)<600', 'p(99)<1200'],
    'db_operation_time': ['p(95)<500', 'p(99)<1000'],
    success: ['rate>0.90'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)', 'p(99.9)'],
};

function generateResourceId() {
  return `R${Math.floor(Math.random() * 10000)}`;
}

function generateDate(offsetDays = 0, offsetHours = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  date.setHours(date.getHours() + offsetHours, 0, 0, 0);
  date.setMinutes(0, 0, 0);
  return date.toISOString();
}

function encodeURIComponent(str) {
  // k6-compatible URL encoding - manually encode all special characters
  let encoded = '';
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const code = char.charCodeAt(0);
    // Unreserved characters: A-Z a-z 0-9 - _ . ! ~ * ' ( )
    if (
      (code >= 65 && code <= 90) || // A-Z
      (code >= 97 && code <= 122) || // a-z
      (code >= 48 && code <= 57) || // 0-9
      code === 45 || // -
      code === 95 || // _
      code === 46 || // .
      code === 33 || // !
      code === 126 || // ~
      code === 42 || // *
      code === 39 || // '
      code === 40 || // (
      code === 41 // )
    ) {
      encoded += char;
    } else {
      // Encode as UTF-8 bytes
      if (code < 128) {
        encoded += '%' + code.toString(16).toUpperCase().padStart(2, '0');
      } else if (code < 2048) {
        encoded +=
          '%' +
          ((code >> 6) | 192).toString(16).toUpperCase().padStart(2, '0') +
          '%' +
          ((code & 63) | 128).toString(16).toUpperCase().padStart(2, '0');
      } else {
        encoded +=
          '%' +
          ((code >> 12) | 224).toString(16).toUpperCase().padStart(2, '0') +
          '%' +
          (((code >> 6) & 63) | 128).toString(16).toUpperCase().padStart(2, '0') +
          '%' +
          ((code & 63) | 128).toString(16).toUpperCase().padStart(2, '0');
      }
    }
  }
  return encoded;
}

function buildQueryString(params) {
  const pairs = [];
  for (const key in params) {
    if (params.hasOwnProperty(key)) {
      const encodedKey = encodeURIComponent(key);
      const encodedValue = encodeURIComponent(params[key]);
      pairs.push(`${encodedKey}=${encodedValue}`);
    }
  }
  return pairs.join('&');
}

export default function () {
  const resourceId = generateResourceId();
  const startTime = Date.now();

  const singleBookingPayload = JSON.stringify({
    resource_id: resourceId,
    start_time: generateDate(2, 9),
    end_time: generateDate(2, 10),
  });

  const bookingStartTime = Date.now();
  const singleBookingResponse = http.post(
    `${BASE_URL}/bookings`,
    singleBookingPayload,
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'CreateBooking' },
    },
  );
  const bookingDuration = Date.now() - bookingStartTime;
  bookingResponseTime.add(bookingDuration);
  dbOperationTime.add(bookingDuration);

  const singleBookingSuccess = check(singleBookingResponse, {
    'single booking created': (r) => r.status === 201,
    'single booking response time recorded': (r) => true,
  });

  if (!singleBookingSuccess) {
    errorCounter.add(1);
    if (singleBookingResponse.status >= 400) {
      console.error(
        `[SPIKE_TEST] Booking failed - Status: ${singleBookingResponse.status}, Duration: ${bookingDuration}ms`,
      );
    }
  }

  successRate.add(singleBookingSuccess);
  bookingCounter.add(1);

  if (singleBookingResponse.json('has_conflict')) {
    conflictRate.add(1);
  }

  sleep(Math.random() * 0.5);

  const recurringBookingPayload = JSON.stringify({
    resource_id: resourceId,
    start_time: generateDate(3, 14),
    end_time: generateDate(3, 15),
    recurrence_rule: 'RRULE:FREQ=WEEKLY;COUNT=5',
  });

  const recurringBookingStartTime = Date.now();
  const recurringBookingResponse = http.post(
    `${BASE_URL}/bookings`,
    recurringBookingPayload,
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'CreateRecurringBooking' },
    },
  );
  const recurringBookingDuration = Date.now() - recurringBookingStartTime;
  bookingResponseTime.add(recurringBookingDuration);
  dbOperationTime.add(recurringBookingDuration);

  const recurringBookingSuccess = check(recurringBookingResponse, {
    'recurring booking created': (r) => r.status === 201,
    'recurring booking response time recorded': (r) => true,
  });

  if (!recurringBookingSuccess) {
    errorCounter.add(1);
    if (recurringBookingResponse.status >= 400) {
      console.error(
        `[SPIKE_TEST] Recurring booking failed - Status: ${recurringBookingResponse.status}, Duration: ${recurringBookingDuration}ms`,
      );
    }
  }

  successRate.add(recurringBookingSuccess);
  bookingCounter.add(1);

  if (recurringBookingResponse.json('has_conflict')) {
    conflictRate.add(1);
  }

  sleep(Math.random() * 0.5);

  const startDate = generateDate(2);
  const endDate = generateDate(9);

  const startDateObj = new Date(startDate);
  const endDateObj = new Date(endDate);

  if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
    console.error(
      `[SPIKE_TEST] Invalid dates generated: start=${startDate}, end=${endDate}`,
    );
    return;
  }

  if (startDateObj >= endDateObj) {
    console.error(
      `[SPIKE_TEST] Invalid date range: start=${startDate} >= end=${endDate}`,
    );
    return;
  }

  const queryParams = {
    resource_id: resourceId,
    start_date: startDate,
    end_date: endDate,
  };

  const queryString = buildQueryString(queryParams);
  const availabilityUrl = `${BASE_URL}/bookings/availability?${queryString}`;

  const availabilityStartTime = Date.now();
  const availabilityResponse = http.get(availabilityUrl, {
    tags: { name: 'Availability' },
    timeout: '10s',
  });
  const availabilityDuration = Date.now() - availabilityStartTime;
  availabilityResponseTime.add(availabilityDuration);
  dbOperationTime.add(availabilityDuration);

  const availabilityChecks = check(availabilityResponse, {
    'availability check succeeded': (r) => r.status === 200,
    'availability response time recorded': (r) => true,
    'availability has valid response': (r) => {
      if (r.status !== 200) {
        return false;
      }
      try {
        const json = r.json();
        return (
          json &&
          json.resource_id &&
          json.start_date &&
          json.end_date &&
          Array.isArray(json.available_slots)
        );
      } catch (e) {
        return false;
      }
    },
  });

  if (!availabilityChecks) {
    availabilityErrors.add(1);
    errorCounter.add(1);
    if (availabilityResponse.status >= 400) {
      console.error(
        `[SPIKE_TEST] Availability failed - Status: ${availabilityResponse.status}, Duration: ${availabilityDuration}ms`,
      );
    }
  }

  const totalDuration = Date.now() - startTime;
}

export function handleSummary(data) {
  const httpReqDuration = data.metrics.http_req_duration;
  const httpReqFailed = data.metrics.http_req_failed;
  const bookingResponseTime = data.metrics.booking_response_time;
  const availabilityResponseTime = data.metrics.availability_response_time;
  const dbOperationTime = data.metrics.db_operation_time;
  const success = data.metrics.success;
  const conflicts = data.metrics.conflicts;
  const totalBookings = data.metrics.total_bookings || { values: { count: 0 } };
  const totalErrors = data.metrics.total_errors || { values: { count: 0 } };
  const availabilityErrors = data.metrics.availability_errors || {
    values: { count: 0 },
  };

  const summary = {
    timestamp: new Date().toISOString(),
    test_type: 'spike_test',
    duration: data.state.testRunDurationMs,
    total_requests: data.metrics.http_reqs.values.count,
    total_vus: data.state.vus,
    max_vus: data.state.maxVus,
    summary: {
      http_requests: {
        total: data.metrics.http_reqs.values.count,
        failed: httpReqFailed
          ? (httpReqFailed.values.rate * 100).toFixed(2) + '%'
          : '0%',
        success_rate:
          success && success.values
            ? (success.values.rate * 100).toFixed(2) + '%'
            : 'N/A',
      },
      response_times: {
        http_req_duration: httpReqDuration
          ? {
              avg: httpReqDuration.values.avg
                ? httpReqDuration.values.avg.toFixed(2) + 'ms'
                : 'N/A',
              p95: httpReqDuration.values.p95
                ? httpReqDuration.values.p95.toFixed(2) + 'ms'
                : 'N/A',
              p99: httpReqDuration.values.p99
                ? httpReqDuration.values.p99.toFixed(2) + 'ms'
                : 'N/A',
              p999: httpReqDuration.values.p999
                ? httpReqDuration.values.p999.toFixed(2) + 'ms'
                : 'N/A',
              max: httpReqDuration.values.max
                ? httpReqDuration.values.max.toFixed(2) + 'ms'
                : 'N/A',
            }
          : 'N/A',
        booking_response_time: bookingResponseTime
          ? {
              avg: bookingResponseTime.values.avg
                ? bookingResponseTime.values.avg.toFixed(2) + 'ms'
                : 'N/A',
              p95: bookingResponseTime.values.p95
                ? bookingResponseTime.values.p95.toFixed(2) + 'ms'
                : 'N/A',
              p99: bookingResponseTime.values.p99
                ? bookingResponseTime.values.p99.toFixed(2) + 'ms'
                : 'N/A',
              p999: bookingResponseTime.values.p999
                ? bookingResponseTime.values.p999.toFixed(2) + 'ms'
                : 'N/A',
              max: bookingResponseTime.values.max
                ? bookingResponseTime.values.max.toFixed(2) + 'ms'
                : 'N/A',
            }
          : 'N/A',
        availability_response_time: availabilityResponseTime
          ? {
              avg: availabilityResponseTime.values.avg
                ? availabilityResponseTime.values.avg.toFixed(2) + 'ms'
                : 'N/A',
              p95: availabilityResponseTime.values.p95
                ? availabilityResponseTime.values.p95.toFixed(2) + 'ms'
                : 'N/A',
              p99: availabilityResponseTime.values.p99
                ? availabilityResponseTime.values.p99.toFixed(2) + 'ms'
                : 'N/A',
              p999: availabilityResponseTime.values.p999
                ? availabilityResponseTime.values.p999.toFixed(2) + 'ms'
                : 'N/A',
              max: availabilityResponseTime.values.max
                ? availabilityResponseTime.values.max.toFixed(2) + 'ms'
                : 'N/A',
            }
          : 'N/A',
        db_operation_time: dbOperationTime
          ? {
              avg: dbOperationTime.values.avg
                ? dbOperationTime.values.avg.toFixed(2) + 'ms'
                : 'N/A',
              p95: dbOperationTime.values.p95
                ? dbOperationTime.values.p95.toFixed(2) + 'ms'
                : 'N/A',
              p99: dbOperationTime.values.p99
                ? dbOperationTime.values.p99.toFixed(2) + 'ms'
                : 'N/A',
              p999: dbOperationTime.values.p999
                ? dbOperationTime.values.p999.toFixed(2) + 'ms'
                : 'N/A',
              max: dbOperationTime.values.max
                ? dbOperationTime.values.max.toFixed(2) + 'ms'
                : 'N/A',
            }
          : 'N/A',
      },
      error_rates: {
        total_errors: totalErrors.values.count,
        availability_errors: availabilityErrors.values.count,
        conflict_rate:
          conflicts && conflicts.values
            ? (conflicts.values.rate * 100).toFixed(2) + '%'
            : '0%',
      },
      bookings: {
        total: totalBookings.values.count,
        conflicts: conflicts && conflicts.values ? conflicts.values.count : 0,
      },
      performance_analysis: {
        requests_per_second:
          data.metrics.http_reqs.values.count > 0
            ? (
                data.metrics.http_reqs.values.count /
                (data.state.testRunDurationMs / 1000)
              ).toFixed(2)
            : '0',
        peak_load: data.state.maxVus || 0,
        avg_response_time: httpReqDuration
          ? httpReqDuration.values.avg.toFixed(2) + 'ms'
          : 'N/A',
        error_rate: httpReqFailed
          ? (httpReqFailed.values.rate * 100).toFixed(2) + '%'
          : '0%',
      },
    },
  };

  return {
    'spike-test-summary.json': JSON.stringify(summary, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, options) {
  const indent = options.indent || '';
  const enableColors = options.enableColors || false;

  const httpReqDuration = data.metrics.http_req_duration;
  const httpReqFailed = data.metrics.http_req_failed;
  const bookingResponseTime = data.metrics.booking_response_time;
  const availabilityResponseTime = data.metrics.availability_response_time;
  const dbOperationTime = data.metrics.db_operation_time;
  const success = data.metrics.success;
  const conflicts = data.metrics.conflicts;
  const totalBookings = data.metrics.total_bookings || { values: { count: 0 } };
  const totalErrors = data.metrics.total_errors || { values: { count: 0 } };
  const availabilityErrors = data.metrics.availability_errors || {
    values: { count: 0 },
  };

  let summary = '\n';
  summary += `${indent}═══════════════════════════════════════════════════════════════\n`;
  summary += `${indent}           SPIKE TEST RESULTS (10,000+ requests in 30s)\n`;
  summary += `${indent}═══════════════════════════════════════════════════════════════\n\n`;

  summary += `${indent}Test Overview:\n`;
  summary += `${indent}  Duration: ${(data.state.testRunDurationMs / 1000).toFixed(2)}s\n`;
  summary += `${indent}  Total Requests: ${data.metrics.http_reqs.values.count}\n`;
  summary += `${indent}  Peak VUs: ${data.state.maxVus || 0}\n`;
  summary += `${indent}  Requests/sec: ${(
    data.metrics.http_reqs.values.count /
    (data.state.testRunDurationMs / 1000)
  ).toFixed(2)}\n\n`;

  summary += `${indent}═══════════════════════════════════════════════════════════════\n`;
  summary += `${indent}Response Times (HTTP Requests)\n`;
  summary += `${indent}═══════════════════════════════════════════════════════════════\n`;
  if (httpReqDuration && httpReqDuration.values) {
    summary += `${indent}  Average: ${httpReqDuration.values.avg.toFixed(2)}ms\n`;
    summary += `${indent}  Median: ${httpReqDuration.values.med.toFixed(2)}ms\n`;
    summary += `${indent}  P90: ${httpReqDuration.values['p(90)'].toFixed(2)}ms\n`;
    summary += `${indent}  P95: ${httpReqDuration.values.p95.toFixed(2)}ms\n`;
    summary += `${indent}  P99: ${httpReqDuration.values.p99.toFixed(2)}ms\n`;
    summary += `${indent}  P99.9: ${httpReqDuration.values['p(99.9)']
      ? httpReqDuration.values['p(99.9)'].toFixed(2) + 'ms'
      : 'N/A'}\n`;
    summary += `${indent}  Min: ${httpReqDuration.values.min.toFixed(2)}ms\n`;
    summary += `${indent}  Max: ${httpReqDuration.values.max.toFixed(2)}ms\n`;
  } else {
    summary += `${indent}  N/A\n`;
  }
  summary += `\n`;

  summary += `${indent}═══════════════════════════════════════════════════════════════\n`;
  summary += `${indent}Booking Response Times (DB Operations)\n`;
  summary += `${indent}═══════════════════════════════════════════════════════════════\n`;
  if (bookingResponseTime && bookingResponseTime.values) {
    summary += `${indent}  Average: ${bookingResponseTime.values.avg.toFixed(2)}ms\n`;
    summary += `${indent}  P95: ${bookingResponseTime.values.p95.toFixed(2)}ms\n`;
    summary += `${indent}  P99: ${bookingResponseTime.values.p99.toFixed(2)}ms\n`;
    summary += `${indent}  P99.9: ${bookingResponseTime.values['p(99.9)']
      ? bookingResponseTime.values['p(99.9)'].toFixed(2) + 'ms'
      : 'N/A'}\n`;
    summary += `${indent}  Max: ${bookingResponseTime.values.max.toFixed(2)}ms\n`;
  } else {
    summary += `${indent}  N/A\n`;
  }
  summary += `\n`;

  summary += `${indent}═══════════════════════════════════════════════════════════════\n`;
  summary += `${indent}Availability Response Times (DB Queries)\n`;
  summary += `${indent}═══════════════════════════════════════════════════════════════\n`;
  if (availabilityResponseTime && availabilityResponseTime.values) {
    summary += `${indent}  Average: ${availabilityResponseTime.values.avg.toFixed(2)}ms\n`;
    summary += `${indent}  P95: ${availabilityResponseTime.values.p95.toFixed(2)}ms\n`;
    summary += `${indent}  P99: ${availabilityResponseTime.values.p99.toFixed(2)}ms\n`;
    summary += `${indent}  P99.9: ${availabilityResponseTime.values['p(99.9)']
      ? availabilityResponseTime.values['p(99.9)'].toFixed(2) + 'ms'
      : 'N/A'}\n`;
    summary += `${indent}  Max: ${availabilityResponseTime.values.max.toFixed(2)}ms\n`;
  } else {
    summary += `${indent}  N/A\n`;
  }
  summary += `\n`;

  summary += `${indent}═══════════════════════════════════════════════════════════════\n`;
  summary += `${indent}DB Operation Performance (Inferred)\n`;
  summary += `${indent}═══════════════════════════════════════════════════════════════\n`;
  if (dbOperationTime && dbOperationTime.values) {
    summary += `${indent}  Average: ${dbOperationTime.values.avg.toFixed(2)}ms\n`;
    summary += `${indent}  P95: ${dbOperationTime.values.p95.toFixed(2)}ms\n`;
    summary += `${indent}  P99: ${dbOperationTime.values.p99.toFixed(2)}ms\n`;
    summary += `${indent}  P99.9: ${dbOperationTime.values['p(99.9)']
      ? dbOperationTime.values['p(99.9)'].toFixed(2) + 'ms'
      : 'N/A'}\n`;
    summary += `${indent}  Max: ${dbOperationTime.values.max.toFixed(2)}ms\n`;
    summary += `\n${indent}  Note: DB operation time is inferred from API response times.\n`;
    summary += `${indent}        For actual DB metrics, monitor PostgreSQL directly.\n`;
  } else {
    summary += `${indent}  N/A\n`;
  }
  summary += `\n`;

  summary += `${indent}═══════════════════════════════════════════════════════════════\n`;
  summary += `${indent}Error Rates\n`;
  summary += `${indent}═══════════════════════════════════════════════════════════════\n`;
  summary += `${indent}  HTTP Request Failures: ${httpReqFailed
    ? (httpReqFailed.values.rate * 100).toFixed(2) + '%'
    : '0%'}\n`;
  summary += `${indent}  Success Rate: ${success && success.values
    ? (success.values.rate * 100).toFixed(2) + '%'
    : 'N/A'}\n`;
  summary += `${indent}  Total Errors: ${totalErrors.values.count}\n`;
  summary += `${indent}  Availability Errors: ${availabilityErrors.values.count}\n`;
  summary += `${indent}  Conflict Rate: ${conflicts && conflicts.values
    ? (conflicts.values.rate * 100).toFixed(2) + '%'
    : '0%'}\n`;
  summary += `\n`;

  summary += `${indent}═══════════════════════════════════════════════════════════════\n`;
  summary += `${indent}Bookings Statistics\n`;
  summary += `${indent}═══════════════════════════════════════════════════════════════\n`;
  summary += `${indent}  Total Bookings Attempted: ${totalBookings.values.count}\n`;
  summary += `${indent}  Conflicts: ${conflicts && conflicts.values
    ? conflicts.values.count
    : 0}\n`;
  summary += `\n`;

  if (data.root_group && data.root_group.checks) {
    summary += `${indent}═══════════════════════════════════════════════════════════════\n`;
    summary += `${indent}Check Results\n`;
    summary += `${indent}═══════════════════════════════════════════════════════════════\n`;
    data.root_group.checks.forEach((check) => {
      const passRate =
        (check.passes / (check.passes + check.fails)) * 100;
      summary += `${indent}  ${check.name}: ${passRate.toFixed(2)}% (${check.passes}/${check.passes + check.fails})\n`;
    });
    summary += `\n`;
  }

  summary += `${indent}═══════════════════════════════════════════════════════════════\n`;
  summary += `${indent}Performance Analysis\n`;
  summary += `${indent}═══════════════════════════════════════════════════════════════\n`;
  summary += `${indent}  Throughput: ${(
    data.metrics.http_reqs.values.count /
    (data.state.testRunDurationMs / 1000)
  ).toFixed(2)} req/s\n`;
  summary += `${indent}  Peak Load: ${data.state.maxVus || 0} VUs\n`;
  summary += `${indent}  Avg Response Time: ${httpReqDuration && httpReqDuration.values
    ? httpReqDuration.values.avg.toFixed(2) + 'ms'
    : 'N/A'}\n`;
  summary += `${indent}  Error Rate: ${httpReqFailed
    ? (httpReqFailed.values.rate * 100).toFixed(2) + '%'
    : '0%'}\n`;

  if (
    httpReqDuration &&
    httpReqDuration.values.p95 > 1000 &&
    httpReqDuration.values.p99 > 2000
  ) {
    summary += `\n${indent}  ⚠️  WARNING: Response times exceed thresholds!\n`;
    summary += `${indent}     Consider optimizing database queries and connection pooling.\n`;
  }

  if (httpReqFailed && httpReqFailed.values.rate > 0.05) {
    summary += `\n${indent}  ⚠️  WARNING: Error rate exceeds 5%!\n`;
    summary += `${indent}     Review error logs and database connection pool settings.\n`;
  }

  summary += `\n${indent}═══════════════════════════════════════════════════════════════\n`;

  return summary;
}

