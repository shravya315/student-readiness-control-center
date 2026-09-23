import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { z } from 'zod';
import './styles.css';

const API_BASE_URL = 'http://localhost:5000/api';
const StudentSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  currentScore: z.number().nullable(),
  version: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const StudentsResponseSchema = z.object({
  data: z.array(StudentSchema),
  pagination: z.object({
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

const AttemptSchema = z.object({
  id: z.string(),
  competencyId: z.string(),
  score: z.number(),
  evaluatorId: z.string(),
  submittedAt: z.string(),
  voided: z.boolean(),
  competency: z.object({
    id: z.string(),
    key: z.string(),
    weight: z.number(),
  }).optional(),
});

const StudentDetailsSchema = StudentSchema.extend({
  attempts: z.array(AttemptSchema),
});

const ActivityEventSchema = z.object({
  eventId: z.string(),
  type: z.enum([
    'attempt.succeeded',
    'attempt.rejected',
  ]),
  tenantId: z.string(),
  studentId: z.string(),
  attemptId: z.string().optional(),
  idempotencyKey: z.string().optional(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});

const ActivityResponseSchema = z.object({
  data: z.array(ActivityEventSchema),
});

type Student = {
  id: string;
  name: string;
  email: string;
  currentScore: number | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

type Attempt = {
  id: string;
  competencyId: string;
  score: number;
  evaluatorId: string;
  submittedAt: string;
  voided: boolean;
  competency?: {
    id: string;
    key: string;
    weight: number;
  };
};

type StudentDetails = Student & {
  attempts: Attempt[];
};
type ActivityEvent = {
  eventId: string;
  type: 'attempt.succeeded' | 'attempt.rejected';
  tenantId: string;
  studentId: string;
  attemptId?: string;
  idempotencyKey?: string;
  payload: {
    score?: number;
    competency?: string;
    evaluatorId?: string;
    reason?: string;
    readiness?: {
      score: number | null;
      status: string;
    };
  };
  createdAt: string;
};

type StudentsResponse = {
  data: Student[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

type Readiness = {
  score: number | null;
  status: string;
  missingCompetencies: string[];
};

type Status =
  | ''
  | 'READY'
  | 'NEARLY_READY'
  | 'DEVELOPING'
  | 'NEEDS_PREPARATION'
  | 'INCOMPLETE';

const COMPETENCIES = [
  {
    key: 'frontend',
    label: 'Frontend',
    weight: 30,
  },
  {
    key: 'backend',
    label: 'Backend',
    weight: 30,
  },
  {
    key: 'databases',
    label: 'Databases',
    weight: 25,
  },
  {
    key: 'problem_solving',
    label: 'Problem Solving',
    weight: 15,
  },
];

function getStatus(score: number | null): string {
  if (score === null) return 'INCOMPLETE';
  if (score >= 80) return 'READY';
  if (score >= 65) return 'NEARLY_READY';
  if (score >= 50) return 'DEVELOPING';
  return 'NEEDS_PREPARATION';
}

function statusClass(status: string) {
  return status.toLowerCase().replace(/_/g, '-');
}

async function fetchStudents(
  token: string,
  search: string,
  status: Status,
  sortOrder: 'asc' | 'desc',
  page: number,
  signal: AbortSignal,
): Promise<StudentsResponse> {
  const params = new URLSearchParams();

  if (search.trim()) {
    params.set('search', search.trim());
  }

  if (status) {
    params.set('status', status);
  }

  params.set('sortBy', 'name');
  params.set('sortOrder', sortOrder);
  params.set('page', String(page));
  params.set('pageSize', '10');

  const response = await fetch(
    `${API_BASE_URL}/students?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal,
    },
  );

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(
      body?.error?.message || 'Failed to load students.',
    ) as Error & {
      status?: number;
      code?: string;
    };

    error.status = response.status;
    error.code = body?.error?.code;

    throw error;
  }

  const parsed = StudentsResponseSchema.safeParse(body);

  if (!parsed.success) {
    throw new Error(
      'Invalid student list data received from the server.',
    );
  }

  return parsed.data;
}

async function fetchStudent(
  token: string,
  studentId: string,
  signal?: AbortSignal,
): Promise<StudentDetails> {
  const response = await fetch(
    `${API_BASE_URL}/students/${studentId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal,
    },
  );

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(
      body?.error?.message || 'Failed to load student.',
    ) as Error & {
      status?: number;
      code?: string;
    };

    error.status = response.status;
    error.code = body?.error?.code;

    throw error;
  }

  const parsed = StudentDetailsSchema.safeParse(body?.data);

  if (!parsed.success) {
    throw new Error(
      'Invalid student detail data received from the server.',
    );
  }

  return parsed.data;
}

async function fetchActivity(
  token: string,
  studentId: string,
): Promise<ActivityEvent[]> {
  const response = await fetch(
    `${API_BASE_URL}/students/${studentId}/activity`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      body?.error?.message ||
        'Failed to load student activity.',
    );
  }

  const parsed = ActivityResponseSchema.safeParse(body);

if (!parsed.success) {
  throw new Error(
    'Invalid activity data received from the server.'
  );
}

return parsed.data.data as ActivityEvent[];
}

const AttemptResponseSchema = z.object({
  data: z.object({
    attempt: z.object({
      id: z.string(),
    }),
    student: StudentSchema,
  }),
});

async function submitAttempt(
  token: string,
  studentId: string,
  competency: string,
  score: number,
  idempotencyKey: string,
) {
  const response = await fetch(
    `${API_BASE_URL}/students/${studentId}/attempts`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        competency,
        score,
      }),
    },
  );

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(
      body?.error?.message || 'Failed to submit attempt.',
    );

    (
      error as Error & {
        status?: number;
        code?: string;
      }
    ).status = response.status;

    (
      error as Error & {
        status?: number;
        code?: string;
      }
    ).code = body?.error?.code;

    throw error;
  }

  return body;
}

export function App() {
  const [token, setToken] = useState(
    sessionStorage.getItem('readiness_token') || '',
  );

  const [tokenInput, setTokenInput] = useState(token);

const [students, setStudents] = useState<Student[]>([]);

const initialUrlParams = new URLSearchParams(
  window.location.search
);

const initialSearch =
  initialUrlParams.get('search') || '';

const initialStatus =
  (initialUrlParams.get('status') as Status) || '';

const initialSort =
  initialUrlParams.get('sortOrder') === 'desc'
    ? 'desc'
    : 'asc';

const initialPage = Math.max(
  1,
  Number(initialUrlParams.get('page')) || 1
);

const [search, setSearch] = useState(initialSearch);
const [status, setStatus] =
  useState<Status>(initialStatus);
const [sortOrder, setSortOrder] =
  useState<'asc' | 'desc'>(initialSort);

const [page, setPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(1);
  const [totalStudents, setTotalStudents] = useState(0);

  const [selectedStudentId, setSelectedStudentId] =
    useState<string | null>(null);
    const [activity, setActivity] = useState<ActivityEvent[]>([]);
const [activityLoading, setActivityLoading] =
  useState(false);

  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');

  const [selectedStudent, setSelectedStudent] =
    useState<StudentDetails | null>(null);

  const [competency, setCompetency] = useState('frontend');
  const [score, setScore] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');

  /*
   * Load student list
   */
  useEffect(() => {
    if (!token || selectedStudentId) {
      return;
    }

    const controller = new AbortController();

    setLoading(true);
    setError('');

    fetchStudents(
      token,
      search,
      status,
      sortOrder,
      page,
      controller.signal,
    )
      .then((result) => {
        setStudents(result.data);
        setTotalPages(result.pagination.totalPages);
        setTotalStudents(result.pagination.total);
      })
      .catch((err: unknown) => {
  if (
    err instanceof DOMException &&
    err.name === 'AbortError'
  ) {
    return;
  }

  const typedError = err as Error & {
    status?: number;
    code?: string;
  };

  if (typedError.status === 401) {
    sessionStorage.removeItem('readiness_token');

    setToken('');
    setTokenInput('');
    setStudents([]);
    setSelectedStudent(null);
    setSelectedStudentId(null);

    setError(
      'Your session has expired. Please sign in again.'
    );

    return;
  }

  setError(
    err instanceof Error
      ? err.message
      : 'Something went wrong.',
  );
})
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [
    token,
    search,
    status,
    sortOrder,
    page,
    selectedStudentId,
  ]);

  /*
   * Load selected student
   */
  useEffect(() => {
    if (!token || !selectedStudentId) {
      return;
    }

    let active = true;

    setDetailLoading(true);
    setError('');

    fetchStudent(token, selectedStudentId)
      .then((student) => {
        if (active) {
          setSelectedStudent(student);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : 'Failed to load student.',
          );
        }
      })
      .finally(() => {
        if (active) {
          setDetailLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [token, selectedStudentId]);

  useEffect(() => {
  if (!token || !selectedStudentId) {
    setActivity([]);
    return;
  }

  let active = true;

  setActivityLoading(true);

  fetchActivity(token, selectedStudentId)
    .then((events) => {
      if (active) {
        setActivity(events);
      }
    })
    .catch((err: unknown) => {
      if (active) {
        setActivity([]);
        setSubmitMessage(
          err instanceof Error
            ? err.message
            : 'Failed to load activity.',
        );
      }
    })
    .finally(() => {
      if (active) {
        setActivityLoading(false);
      }
    });

  return () => {
    active = false;
  };
}, [token, selectedStudentId]);

  function saveToken() {
  const cleanedToken = tokenInput.trim();

  if (!cleanedToken) {
    setError('Please enter an authentication token.');
    return;
  }

  const accountChanged = cleanedToken !== token;

  sessionStorage.setItem(
    'readiness_token',
    cleanedToken,
  );

  if (accountChanged) {
    // Clear all tenant-scoped data before loading
    // data belonging to the new authenticated account.
    setStudents([]);
    setSelectedStudent(null);
    setSelectedStudentId(null);
    setActivity([]);
    setActivityLoading(false);
    setDetailLoading(false);
    setLoading(false);
    setSubmitMessage('');

    // Reset dashboard state.
    setSearch('');
    setStatus('');
    setSortOrder('asc');
    setPage(1);
  }

  setToken(cleanedToken);
  setError('');
}

  function clearToken() {
    sessionStorage.removeItem('readiness_token');

    setToken('');
    setTokenInput('');
    setStudents([]);
    setSelectedStudent(null);
    setSelectedStudentId(null);
    setError('');
  }

  function openStudent(studentId: string) {
    setSelectedStudentId(studentId);
    setSelectedStudent(null);
    setSubmitMessage('');
  }

  function goBack() {
    setSelectedStudentId(null);
    setSelectedStudent(null);
    setSubmitMessage('');
    setError('');
  }

  async function handleSubmitAttempt(
    event: React.FormEvent,
  ) {
    event.preventDefault();

    if (!selectedStudent) {
      return;
    }

    const numericScore = Number(score);

    if (!competency) {
      setSubmitMessage('Please select a competency.');
      return;
    }

    if (
      !Number.isFinite(numericScore) ||
      numericScore < 0 ||
      numericScore > 100
    ) {
      setSubmitMessage(
        'Score must be a number between 0 and 100.',
      );
      return;
    }

    setSubmitting(true);
    setSubmitMessage('');

    /*
     * One unique key for this logical submission.
     * Repeated requests with the same key are safe.
     */
    const idempotencyKey = crypto.randomUUID();

    try {
      const result = await submitAttempt(
        token,
        selectedStudent.id,
        competency,
        numericScore,
        idempotencyKey,
      );

      setSubmitMessage(
        result.replayed
          ? 'This submission was already processed.'
          : 'Attempt submitted successfully.',
      );

      setScore('');

      /*
       * Reload the student so the new readiness score,
       * version and attempts are visible immediately.
       */
      const updatedStudent = await fetchStudent(
        token,
        selectedStudent.id,
      );

      setSelectedStudent(updatedStudent);
      const updatedActivity = await fetchActivity(
  token,
  selectedStudent.id,
);

setActivity(updatedActivity);

      /*
       * Refresh dashboard data as well.
       */
      const controller = new AbortController();

      const updatedList = await fetchStudents(
        token,
        search,
        status,
        sortOrder,
        page,
        controller.signal,
      );

      setStudents(updatedList.data);
      setTotalPages(
        updatedList.pagination.totalPages,
      );
      setTotalStudents(
        updatedList.pagination.total,
      );
    } catch (err: unknown) {
      const typedError = err as Error & {
        status?: number;
        code?: string;
      };

      if (typedError.code === 'VERSION_CONFLICT') {
        setSubmitMessage(
          'The student was updated by another request. Refreshing the latest data...',
        );

        const latest = await fetchStudent(
          token,
          selectedStudent.id,
        );

        setSelectedStudent(latest);
      } else if (
        typedError.code === 'IDEMPOTENCY_KEY_REUSED'
      ) {
        setSubmitMessage(
          'This submission key was already used with different data.',
        );
      } else {
        setSubmitMessage(
          typedError.message ||
            'Unable to submit the attempt.',
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  /*
   * Login screen
   */
  if (!token) {
    return (
      <main className="page">
        <section className="container auth-card">
          <div className="brand">
            <span className="brand-dot" />
            Readiness Control Center
          </div>

          <h1>Student Readiness Control Center</h1>

          <p className="subtitle">
            Enter a valid authentication token to access
            the student dashboard.
          </p>

          <label htmlFor="token">
            Authentication Token
          </label>

          <input
            id="token"
            type="password"
            value={tokenInput}
            onChange={(event) =>
              setTokenInput(event.target.value)
            }
            placeholder="Paste your JWT token"
          />

          <button
            className="primary-button"
            onClick={saveToken}
          >
            Open Dashboard
          </button>

          {error && (
            <div className="error-box">
              {error}
            </div>
          )}

          <p className="security-note">
            The token is stored only in this browser
            session and is not included in the source
            code.
          </p>
        </section>
      </main>
    );
  }

  /*
   * Student detail screen
   */
  if (selectedStudentId) {
    return (
      <main className="page">
        <header className="topbar">
          <div>
            <div className="brand">
              <span className="brand-dot" />
              Readiness Control Center
            </div>

            <h1>Student Details</h1>

            <p className="subtitle">
              Review competency performance and submit
              assessment attempts.
            </p>
          </div>

          <button
            className="secondary-button"
            onClick={clearToken}
          >
            Sign Out
          </button>
        </header>

        <section className="container">
          <button
            className="back-button"
            onClick={goBack}
          >
            ← Back to Students
          </button>

          {detailLoading && (
            <div className="state-box">
              <div className="spinner" />
              <p>Loading student...</p>
            </div>
          )}

          {!detailLoading && error && (
            <div className="state-box error-state">
              <h3>Unable to load student</h3>
              <p>{error}</p>

              <button
                className="secondary-button"
                onClick={goBack}
              >
                Back to Students
              </button>
            </div>
          )}

          {!detailLoading &&
            !error &&
            selectedStudent && (
              <>
                <div className="detail-header">
                  <div className="large-avatar">
                    {selectedStudent.name
                      .charAt(0)
                      .toUpperCase()}
                  </div>

                  <div>
                    <h2>
                      {selectedStudent.name}
                    </h2>

                    <p>
                      {selectedStudent.email}
                    </p>
                  </div>

                  <div className="detail-score">
                    <span>Readiness Score</span>

                    <strong>
                      {selectedStudent.currentScore ===
                      null
                        ? '—'
                        : `${selectedStudent.currentScore}%`}
                    </strong>

                    <span
                      className={`status ${statusClass(
                        getStatus(
                          selectedStudent.currentScore,
                        ),
                      )}`}
                    >
                      {getStatus(
                        selectedStudent.currentScore,
                      ).replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>

                <div className="detail-grid">
                  <section className="detail-section">
                    <div className="section-heading">
                      <div>
                        <h3>Competency Performance</h3>
                        <p>
                          Latest non-voided attempt for
                          each competency.
                        </p>
                      </div>
                    </div>

                    <div className="competency-list">
                      {COMPETENCIES.map(
                        (item) => {
                          const attempts =
                            selectedStudent.attempts
                              .filter(
                                (attempt) =>
                                  attempt.competency
                                    ?.key ===
                                  item.key,
                              )
                              .sort(
                                (a, b) =>
                                  new Date(
                                    b.submittedAt,
                                  ).getTime() -
                                  new Date(
                                    a.submittedAt,
                                  ).getTime(),
                              );

                          const latest =
                            attempts.find(
                              (attempt) =>
                                !attempt.voided,
                            );

                          return (
                            <div
                              className="competency-row"
                              key={item.key}
                            >
                              <div>
                                <strong>
                                  {item.label}
                                </strong>

                                <span>
                                  Weight: {item.weight}%
                                </span>
                              </div>

                              <strong className="competency-score">
                                {latest
                                  ? `${latest.score}%`
                                  : 'Missing'}
                              </strong>
                            </div>
                          );
                        },
                      )}
                    </div>
                  </section>

                  <section className="detail-section">
                    <div className="section-heading">
                      <div>
                        <h3>Submit New Attempt</h3>
                        <p>
                          Add a competency assessment for
                          this student.
                        </p>
                      </div>
                    </div>

                    <form
                      className="attempt-form"
                      onSubmit={handleSubmitAttempt}
                    >
                      <div>
                        <label htmlFor="competency">
                          Competency
                        </label>

                        <select
                          id="competency"
                          value={competency}
                          onChange={(event) =>
                            setCompetency(
                              event.target.value,
                            )
                          }
                          disabled={submitting}
                        >
                          {COMPETENCIES.map(
                            (item) => (
                              <option
                                key={item.key}
                                value={item.key}
                              >
                                {item.label}
                              </option>
                            ),
                          )}
                        </select>
                      </div>

                      <div>
                        <label htmlFor="score">
                          Score
                        </label>

                        <input
                          id="score"
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={score}
                          onChange={(event) =>
                            setScore(
                              event.target.value,
                            )
                          }
                          placeholder="0 - 100"
                          disabled={submitting}
                        />
                      </div>

                      <button
                        className="primary-button"
                        type="submit"
                        disabled={submitting}
                      >
                        {submitting
                          ? 'Submitting...'
                          : 'Submit Attempt'}
                      </button>

                      {submitMessage && (
                        <div className="submit-message">
                          {submitMessage}
                        </div>
                      )}
                    </form>
                  </section>
                </div>

                <section className="detail-section activity-section">
                  <div className="section-heading">
                    <div>
                      <h3>Attempt History</h3>
                      <p>
                        Assessment attempts recorded for
                        this student.
                      </p>
                    </div>

                    <span>
                      Version {selectedStudent.version}
                    </span>
                  </div>

                  {selectedStudent.attempts.length ===
                    0 && (
                    <div className="empty-history">
                      No attempts recorded yet.
                    </div>
                  )}

                  {selectedStudent.attempts.length >
                    0 && (
                    <div className="attempt-table-wrapper">
                      <table>
                        <thead>
                          <tr>
                            <th>Competency</th>
                            <th>Score</th>
                            <th>Submitted</th>
                            <th>Status</th>
                          </tr>
                        </thead>

                        <tbody>
                          {selectedStudent.attempts
                            .slice()
                            .sort(
                              (a, b) =>
                                new Date(
                                  b.submittedAt,
                                ).getTime() -
                                new Date(
                                  a.submittedAt,
                                ).getTime(),
                            )
                            .map((attempt) => (
                              <tr key={attempt.id}>
                                <td>
                                  {attempt.competency
                                    ?.key ||
                                    attempt.competencyId}
                                </td>

                                <td>
                                  {attempt.score}%
                                </td>

                                <td>
                                  {new Date(
                                    attempt.submittedAt,
                                  ).toLocaleString()}
                                </td>

                                <td>
                                  <span
                                    className={`status ${
                                      attempt.voided
                                        ? 'needs-preparation'
                                        : 'ready'
                                    }`}
                                  >
                                    {attempt.voided
                                      ? 'VOIDED'
                                      : 'VALID'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
                <section className="detail-section activity-section">
  <div className="section-heading">
    <div>
      <h3>Activity</h3>
      <p>
        Operational events recorded for this student.
      </p>
    </div>
  </div>

  {activityLoading && (
    <div className="activity-loading">
      Loading activity...
    </div>
  )}

  {!activityLoading && activity.length === 0 && (
    <div className="empty-history">
      No activity recorded yet.
    </div>
  )}

  {!activityLoading && activity.length > 0 && (
    <div className="activity-list">
      {activity.map((event) => {
        const succeeded =
          event.type === 'attempt.succeeded';

        return (
          <article
            className="activity-item"
            key={event.eventId}
          >
            <div
              className={`activity-icon ${
                succeeded ? 'success' : 'rejected'
              }`}
            >
              {succeeded ? '✓' : '!'}
            </div>

            <div className="activity-content">
              <div className="activity-title">
                <strong>
                  {succeeded
                    ? 'Attempt succeeded'
                    : 'Attempt rejected'}
                </strong>

                <span>
                  {new Date(
                    event.createdAt,
                  ).toLocaleString()}
                </span>
              </div>

              {succeeded ? (
                <>
                  <p>
                    <strong>
                      {event.payload.competency
                        ?.replace(/_/g, ' ')
                        .replace(
                          /\b\w/g,
                          (char: string) =>
                            char.toUpperCase(),
                        )}
                    </strong>{' '}
                    assessment submitted with a score of{' '}
                    <strong>
                      {event.payload.score}%
                    </strong>
                  </p>

                  {event.payload.readiness && (
                    <div className="activity-readiness">
                      Readiness:{' '}
                      <strong>
                        {event.payload.readiness
                          .score ?? '—'}
                        %
                      </strong>

                      <span
                        className={`status ${statusClass(
                          event.payload.readiness
                            .status,
                        )}`}
                      >
                        {event.payload.readiness.status.replace(
                          '_',
                          ' ',
                        )}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <p>
                  {event.payload.reason ||
                    'The attempt was rejected.'}
                </p>
              )}
            </div>
          </article>
        );
      })}
    </div>
  )}
</section>
              </>
            )}
        </section>
      </main>
    );
  }

  /*
   * Dashboard
   */
  return (
    <main className="page">
      <header className="topbar">
        <div>
          <div className="brand">
            <span className="brand-dot" />
            Readiness Control Center
          </div>

          <h1>Student Dashboard</h1>

          <p className="subtitle">
            Monitor student competency readiness and
            assessment progress.
          </p>
        </div>

        <button
          className="secondary-button"
          onClick={clearToken}
        >
          Sign Out
        </button>
      </header>

      <section className="container dashboard">
        <div className="toolbar">
          <div className="search-wrapper">
            <label htmlFor="search">
              Search students
            </label>

            <input
              id="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search by name or email..."
            />
          </div>

          <div className="filter-wrapper">
            <label htmlFor="status">
              Readiness Status
            </label>

            <select
              id="status"
              value={status}
              onChange={(event) => {
                setStatus(
                  event.target.value as Status,
                );
                setPage(1);
              }}
            >
              <option value="">
                All statuses
              </option>
              <option value="READY">Ready</option>
              <option value="NEARLY_READY">
                Nearly Ready
              </option>
              <option value="DEVELOPING">
                Developing
              </option>
              <option value="NEEDS_PREPARATION">
                Needs Preparation
              </option>
              <option value="INCOMPLETE">
                Incomplete
              </option>
            </select>
          </div>

          <div className="filter-wrapper">
            <label htmlFor="sort">
              Sort by Name
            </label>

            <select
              id="sort"
              value={sortOrder}
              onChange={(event) => {
                setSortOrder(
                  event.target.value as
                    | 'asc'
                    | 'desc',
                );
                setPage(1);
              }}
            >
              <option value="asc">
                A → Z
              </option>
              <option value="desc">
                Z → A
              </option>
            </select>
          </div>
        </div>

        <div className="dashboard-summary">
          <div>
            <strong>{totalStudents}</strong>
            <span>Total Students</span>
          </div>

          <div>
            <strong>{students.length}</strong>
            <span>Showing</span>
          </div>

          <div>
            <strong>{page}</strong>
            <span>Current Page</span>
          </div>
        </div>

        {loading && (
          <div className="state-box">
            <div className="spinner" />
            <p>Loading students...</p>
          </div>
        )}

        {!loading && error && (
          <div className="state-box error-state">
            <h3>Unable to load students</h3>
            <p>{error}</p>
          </div>
        )}

        {!loading &&
          !error &&
          students.length === 0 && (
            <div className="state-box">
              <h3>No students found</h3>
              <p>
                Try changing your search or readiness
                filter.
              </p>
            </div>
          )}

        {!loading &&
          !error &&
          students.length > 0 && (
            <div className="student-grid">
              {students.map((student) => {
                const studentStatus = getStatus(
                  student.currentScore,
                );

                return (
                  <article
                    className="student-card"
                    key={student.id}
                  >
                    <div className="student-header">
                      <div className="avatar">
                        {student.name
                          .charAt(0)
                          .toUpperCase()}
                      </div>

                      <div>
                        <h2>{student.name}</h2>
                        <p>{student.email}</p>
                      </div>
                    </div>

                    <div className="student-details">
                      <div>
                        <span className="detail-label">
                          Readiness Score
                        </span>

                        <strong className="score">
                          {student.currentScore ===
                          null
                            ? '—'
                            : `${student.currentScore}%`}
                        </strong>
                      </div>

                      <div>
                        <span className="detail-label">
                          Status
                        </span>

                        <span
                          className={`status ${statusClass(
                            studentStatus,
                          )}`}
                        >
                          {studentStatus.replace(
                            /_/g,
                            ' ',
                          ).toLowerCase()}
                        </span>
                      </div>
                    </div>

                    <div className="student-footer">
                      <span>
                        Version {student.version}
                      </span>

                      <button
                        className="view-button"
                        onClick={() =>
                          openStudent(student.id)
                        }
                      >
                        View Details →
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

        {!loading &&
          !error &&
          students.length > 0 &&
          totalPages > 1 && (
            <div className="pagination">
              <button
                className="secondary-button"
                disabled={page === 1}
                onClick={() =>
                  setPage(
                    (current) => current - 1,
                  )
                }
              >
                ← Previous
              </button>

              <span>
                Page {page} of {totalPages}
              </span>

              <button
                className="secondary-button"
                disabled={
                  page === totalPages
                }
                onClick={() =>
                  setPage(
                    (current) => current + 1,
                  )
                }
              >
                Next →
              </button>
            </div>
          )}
      </section>
    </main>
  );
}

if (document.getElementById('root')) {
  ReactDOM.createRoot(
    document.getElementById('root')!,
  ).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}