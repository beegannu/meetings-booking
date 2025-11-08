import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const conflictRate = new Rate('conflicts');
const successRate = new Rate('success');
const bookingCounter = new Counter('total_bookings');
const availabilityErrors = new Counter('availability_errors');
const errorDetails = new Trend('error_response_time');

export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '1m', target: 50 },
    { duration: '30s', target: 100 },
    { duration: '1m', target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'],
    success: ['rate>0.95'],
    availability_errors: ['count<100'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

const BASE_URL = 'http://localhost:3000';

function generateResourceId() {
  return `R${Math.floor(Math.random() * 1000)}`;
}

function generateDate(offsetDays = 0, offsetHours = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  date.setHours(date.getHours() + offsetHours, 0, 0, 0);
  date.setMinutes(0, 0, 0); // Ensure minutes, seconds, milliseconds are 0
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
          (((code >> 6) & 63) | 128)
            .toString(16)
            .toUpperCase()
            .padStart(2, '0') +
          '%' +
          ((code & 63) | 128).toString(16).toUpperCase().padStart(2, '0');
      }
    }
  }
  return encoded;
}

function buildQueryString(params) {
  // Manually build query string for k6 compatibility
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

function logError(context, response, errorType) {
  if (response.status >= 400) {
    console.error(
      `[${errorType}] Status: ${response.status}, Body: ${response.body}`,
    );
    availabilityErrors.add(1);
    errorDetails.add(response.timings.duration);
  }
}

export default function () {
  const resourceId = generateResourceId();

  const singleBookingPayload = JSON.stringify({
    resource_id: resourceId,
    start_time: generateDate(2, 9),
    end_time: generateDate(2, 10),
  });

  const singleBookingResponse = http.post(
    `${BASE_URL}/bookings`,
    singleBookingPayload,
    { headers: { 'Content-Type': 'application/json' } },
  );

  const singleBookingSuccess = check(singleBookingResponse, {
    'single booking created': (r) => r.status === 201,
    'single booking response time < 500ms': (r) => r.timings.duration < 500,
  });

  if (!singleBookingSuccess) {
    logError('single_booking', singleBookingResponse, 'SINGLE_BOOKING');
  }

  successRate.add(singleBookingSuccess);
  bookingCounter.add(1);

  if (singleBookingResponse.json('has_conflict')) {
    conflictRate.add(1);
  }

  sleep(0.5);

  const recurringBookingPayload = JSON.stringify({
    resource_id: resourceId,
    start_time: generateDate(3, 14),
    end_time: generateDate(3, 15),
    recurrence_rule: 'RRULE:FREQ=WEEKLY;COUNT=5',
  });

  const recurringBookingResponse = http.post(
    `${BASE_URL}/bookings`,
    recurringBookingPayload,
    { headers: { 'Content-Type': 'application/json' } },
  );

  const recurringBookingSuccess = check(recurringBookingResponse, {
    'recurring booking created': (r) => r.status === 201,
    'recurring booking response time < 1000ms': (r) =>
      r.timings.duration < 1000,
  });

  if (!recurringBookingSuccess) {
    logError(
      'recurring_booking',
      recurringBookingResponse,
      'RECURRING_BOOKING',
    );
  }

  successRate.add(recurringBookingSuccess);
  bookingCounter.add(1);

  if (recurringBookingResponse.json('has_conflict')) {
    conflictRate.add(1);
  }

  sleep(0.5);

  // Generate dates for availability check - ensure they're valid and properly formatted
  const startDate = generateDate(2);
  const endDate = generateDate(9);

  // Validate dates before making request
  const startDateObj = new Date(startDate);
  const endDateObj = new Date(endDate);

  if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
    console.error(
      `Invalid dates generated: start=${startDate}, end=${endDate}`,
    );
  }

  if (startDateObj >= endDateObj) {
    console.error(`Invalid date range: start=${startDate} >= end=${endDate}`);
  }

  // Manually construct URL with properly encoded query parameters
  // This ensures ISO date strings with colons and special chars are encoded correctly
  const queryParams = {
    resource_id: resourceId,
    start_date: startDate,
    end_date: endDate,
  };

  const queryString = buildQueryString(queryParams);
  const availabilityUrl = `${BASE_URL}/bookings/availability?${queryString}`;

  // Make the request with manually constructed URL
  const availabilityResponse = http.get(availabilityUrl, {
    tags: { name: 'Availability' },
    timeout: '10s',
  });

  // Log request details for debugging (first few failures only)
  if (availabilityResponse.status !== 200 && Math.random() < 0.01) {
    console.error(`[DEBUG] Availability request details:`);
    console.error(`  URL: ${availabilityUrl}`);
    console.error(`  Query String: ${queryString}`);
    console.error(`  Status: ${availabilityResponse.status}`);
    console.error(`  Body: ${availabilityResponse.body.substring(0, 500)}`);
  }

  const availabilityChecks = check(availabilityResponse, {
    'availability check succeeded': (r) => {
      const success = r.status === 200;
      if (!success) {
        logError('availability', r, 'AVAILABILITY');
        console.error(
          `Availability failed - Status: ${r.status}, URL: ${availabilityUrl}`,
        );
        console.error(`Response body: ${r.body}`);

        // Try to parse error response for better debugging
        try {
          const errorJson = r.json();
          console.error(`Error response JSON: ${JSON.stringify(errorJson)}`);
        } catch (e) {
          console.error(
            `Error response is not JSON (status: ${r.status}): ${r.body.substring(0, 200)}`,
          );
        }
      }
      return success;
    },
    'availability response time < 500ms': (r) => r.timings.duration < 500,
    'availability has valid response': (r) => {
      // First check if status is 200 before trying to parse JSON
      if (r.status !== 200) {
        return false;
      }

      try {
        const json = r.json();
        const isValid =
          json &&
          json.resource_id &&
          json.start_date &&
          json.end_date &&
          Array.isArray(json.available_slots);

        if (!isValid) {
          console.error(`Invalid response structure: ${JSON.stringify(json)}`);
        }

        return isValid;
      } catch (e) {
        console.error(
          `Invalid JSON response (status: ${r.status}): ${r.body.substring(0, 200)}`,
        );
        console.error(`JSON parse error: ${e.message}`);
        return false;
      }
    },
  });

  if (!availabilityChecks) {
    availabilityErrors.add(1);
  }

  sleep(0.5);
}

export function handleSummary(data) {
  const httpReqDuration = data.metrics.http_req_duration;
  const httpReqFailed = data.metrics.http_req_failed;
  const availabilityErrorsCount = data.metrics.availability_errors || {
    values: { count: 0 },
  };

  return {
    'summary.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, options) {
  const indent = options.indent || '';
  const enableColors = options.enableColors || false;

  const httpReqDuration = data.metrics.http_req_duration;
  const httpReqFailed = data.metrics.http_req_failed;
  const availabilityErrors = data.metrics.availability_errors || {
    values: { count: 0 },
  };

  let summary = '\n';
  summary += `${indent}Test Summary\n`;
  summary += `${indent}============\n\n`;

  summary += `${indent}HTTP Requests:\n`;
  summary += `${indent}  Total: ${data.metrics.http_reqs.values.count}\n`;
  summary += `${indent}  Failed: ${(httpReqFailed.values.rate * 100).toFixed(2)}%\n`;

  if (httpReqDuration && httpReqDuration.values) {
    summary += `${indent}  P95: ${httpReqDuration.values.p95 ? httpReqDuration.values.p95.toFixed(2) : 'N/A'}ms\n`;
    summary += `${indent}  P99: ${httpReqDuration.values.p99 ? httpReqDuration.values.p99.toFixed(2) : 'N/A'}ms\n`;
    summary += `${indent}  Avg: ${httpReqDuration.values.avg ? httpReqDuration.values.avg.toFixed(2) : 'N/A'}ms\n`;
    summary += `${indent}  Max: ${httpReqDuration.values.max ? httpReqDuration.values.max.toFixed(2) : 'N/A'}ms\n`;
  } else {
    summary += `${indent}  P95: N/A\n`;
    summary += `${indent}  P99: N/A\n`;
  }

  summary += `\n${indent}Bookings:\n`;
  summary += `${indent}  Total: ${data.metrics.total_bookings.values.count}\n`;
  summary += `${indent}  Conflicts: ${(data.metrics.conflicts.values.rate * 100).toFixed(2)}%\n`;
  summary += `${indent}  Success Rate: ${(data.metrics.success.values.rate * 100).toFixed(2)}%\n`;

  summary += `\n${indent}Availability Errors:\n`;
  summary += `${indent}  Count: ${availabilityErrors.values.count}\n`;

  if (data.root_group && data.root_group.checks) {
    summary += `\n${indent}Check Results:\n`;
    data.root_group.checks.forEach((check) => {
      const passRate = (check.passes / (check.passes + check.fails)) * 100;
      summary += `${indent}  ${check.name}: ${passRate.toFixed(2)}% (${check.passes}/${check.passes + check.fails})\n`;
    });
  }

  return summary;
}
