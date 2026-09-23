import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {App} from './main';

const makeStudent = (
  id: string,
  name: string,
  score: number | null = 80,
) => ({
  id,
  name,
  email: `${id}@example.com`,
  currentScore: score,
  version: 1,
  createdAt: '2026-09-23T10:00:00.000Z',
  updatedAt: '2026-09-23T10:00:00.000Z',
});

const makeStudentsResponse = (students: ReturnType<typeof makeStudent>[]) => ({
  data: students,
  pagination: {
    page: 1,
    pageSize: 10,
    total: students.length,
    totalPages: 1,
  },
});

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe('Student Readiness Control Center frontend', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('prevents duplicate attempt submission while a request is in progress', async () => {
    sessionStorage.setItem('readiness_token', 'test-token');

    const student = makeStudent('student-1', 'Alice');

    let resolveAttempt!: (value: unknown) => void;

    const attemptPromise = new Promise((resolve) => {
      resolveAttempt = resolve;
    });

    let attemptCalls = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, options?: RequestInit) => {
        if (url.includes('/students?')) {
          return Promise.resolve(
            jsonResponse(makeStudentsResponse([student])),
          );
        }

        if (url.endsWith('/students/student-1')) {
          return Promise.resolve(
            jsonResponse({
              data: {
                ...student,
                attempts: [],
              },
            }),
          );
        }

        if (url.includes('/activity')) {
          return Promise.resolve(
            jsonResponse({ data: [] }),
          );
        }

        if (
          url.endsWith('/attempts') &&
          options?.method === 'POST'
        ) {
          attemptCalls += 1;

          return attemptPromise.then(() =>
            jsonResponse({
              data: {
                attempt: {
                  id: 'attempt-1',
                },
                student,
              },
              replayed: false,
            }, 201),
          );
        }

        return Promise.reject(
          new Error(`Unexpected request: ${url}`),
        );
      }),
    );

    render(<App />);

    const studentCard = await screen.findByText('Alice');
    expect(studentCard).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', {
        name: /View Details/i,
      }),
    );

    const scoreInput = await screen.findByLabelText('Score');

    fireEvent.change(scoreInput, {
      target: { value: '85' },
    });

    const submitButton = screen.getByRole('button', {
      name: 'Submit Attempt',
    });

    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByRole('button', {
          name: 'Submitting...',
        }),
      ).toBeDisabled();
    });

    // A second click must not create another request.
    fireEvent.click(submitButton);

    expect(attemptCalls).toBe(1);

    resolveAttempt(undefined);

    await waitFor(() => {
      expect(
        screen.getByText('Attempt submitted successfully.'),
      ).toBeInTheDocument();
    });
  });

  it('ignores an out-of-order older student-list response', async () => {
    sessionStorage.setItem('readiness_token', 'test-token');

    const firstStudent = makeStudent(
      'student-old',
      'Old Response Student',
    );

    const secondStudent = makeStudent(
      'student-new',
      'New Response Student',
    );

    const requests: {
      search: string;
      resolve: (value: unknown) => void;
    }[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (!url.includes('/students?')) {
          return Promise.resolve(
            jsonResponse({ data: [] }),
          );
        }

        const search =
          new URL(url).searchParams.get('search') ?? '';

        return new Promise((resolve) => {
          requests.push({
            search,
            resolve,
          });
        });
      }),
    );

    render(<App />);

    const searchInput =
      screen.getByLabelText('Search students');

    await waitFor(() => {
      expect(requests.length).toBeGreaterThan(0);
    });

    // Resolve the initial request.
    requests[0].resolve(
      jsonResponse(
        makeStudentsResponse([firstStudent]),
      ),
    );

    await waitFor(() => {
      expect(
        screen.getByText('Old Response Student'),
      ).toBeInTheDocument();
    });

    fireEvent.change(searchInput, {
      target: { value: 'new' },
    });

    await waitFor(() => {
      expect(
        requests.some((request) => request.search === 'new'),
      ).toBe(true);
    });

    const newRequest = requests.find(
      (request) => request.search === 'new',
    )!;

    // New request completes first.
    newRequest.resolve(
      jsonResponse(
        makeStudentsResponse([secondStudent]),
      ),
    );

    await waitFor(() => {
      expect(
        screen.getByText('New Response Student'),
      ).toBeInTheDocument();
    });

    // The older request resolves afterwards.
    const initialRequest = requests.find(
      (request) => request.search === '',
    )!;

    initialRequest.resolve(
      jsonResponse(
        makeStudentsResponse([firstStudent]),
      ),
    );

    // The newer result must remain visible.
    await waitFor(() => {
      expect(
        screen.getByText('New Response Student'),
      ).toBeInTheDocument();
    });

    expect(
      screen.queryByText('Old Response Student'),
    ).not.toBeInTheDocument();
  });

  it('cancels the previous student-list request when filters change', async () => {
    sessionStorage.setItem('readiness_token', 'test-token');

    const abortSignals: AbortSignal[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, options?: RequestInit) => {
        if (!url.includes('/students?')) {
          return Promise.resolve(
            jsonResponse({ data: [] }),
          );
        }

        if (options?.signal) {
          abortSignals.push(options.signal);
        }

        return new Promise(() => {
          // Keep requests pending so cleanup/filter changes
          // must abort the previous request.
        });
      }),
    );

    render(<App />);

    const searchInput =
      screen.getByLabelText('Search students');

    await waitFor(() => {
      expect(abortSignals.length).toBe(1);
    });

    const firstSignal = abortSignals[0];

    fireEvent.change(searchInput, {
      target: { value: 'Alice' },
    });

    await waitFor(() => {
      expect(firstSignal.aborted).toBe(true);
    });

    expect(abortSignals.length).toBeGreaterThanOrEqual(2);
  });

  it('shows the VERSION_CONFLICT message when an attempt conflicts', async () => {
    sessionStorage.setItem('readiness_token', 'test-token');

    const student = makeStudent(
      'student-conflict',
      'Conflict Student',
    );

    let postCalls = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, options?: RequestInit) => {
        if (url.includes('/students?')) {
          return Promise.resolve(
            jsonResponse(makeStudentsResponse([student])),
          );
        }

        if (
          url.endsWith('/students/student-conflict') &&
          !url.includes('/activity')
        ) {
          return Promise.resolve(
            jsonResponse({
              data: {
                ...student,
                attempts: [],
              },
            }),
          );
        }

        if (url.includes('/activity')) {
          return Promise.resolve(
            jsonResponse({ data: [] }),
          );
        }

        if (
          url.endsWith('/attempts') &&
          options?.method === 'POST'
        ) {
          postCalls += 1;

          return Promise.resolve(
            jsonResponse(
              {
                error: {
                  code: 'VERSION_CONFLICT',
                  message:
                    'Student was modified by another request',
                },
              },
              409,
            ),
          );
        }

        return Promise.reject(
          new Error(`Unexpected request: ${url}`),
        );
      }),
    );

    render(<App />);

    await screen.findByText('Conflict Student');

    fireEvent.click(
      screen.getByRole('button', {
        name: /View Details/i,
      }),
    );

    const scoreInput = await screen.findByLabelText('Score');

    fireEvent.change(scoreInput, {
      target: { value: '90' },
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Submit Attempt',
      }),
    );

    await waitFor(() => {
      expect(postCalls).toBe(1);
    });

    await waitFor(() => {
      expect(
        screen.getByText(
          /student was updated by another request/i,
        ),
      ).toBeInTheDocument();
    });
  });
});