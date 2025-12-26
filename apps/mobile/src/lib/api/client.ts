import { API_BASE } from "./config";

class ApiClient {
  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ message: "Request failed" }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Auth
  async login(username: string, password: string) {
    return this.request<{
      success: boolean;
      user: { id: number; username: string; name: string };
    }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  }

  async register(username: string, password: string, name?: string) {
    return this.request<{
      success: boolean;
      user: { id: number; username: string; name: string };
    }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password, name }),
    });
  }

  async logout() {
    return this.request<{ success: boolean }>("/api/auth/logout", {
      method: "POST",
    });
  }

  async getUser() {
    return this.request<{ id: number; username: string; name: string } | null>(
      "/api/auth/user",
    );
  }

  // Exercises
  async getExercises(query?: string) {
    const url = query
      ? `/api/exercises?q=${encodeURIComponent(query)}`
      : "/api/exercises";
    return this.request<
      { id: number; name: string; muscle_group: string; created_at: string }[]
    >(url);
  }

  // Templates
  async getTemplates() {
    return this.request<
      {
        id: number;
        user_id: number;
        name: string;
        rest_time: number;
        created_at: string;
        exercises: { exercise_id: number; exercise_name: string }[];
        scheduledDays: number[];
      }[]
    >("/api/templates");
  }

  async getTemplate(id: number) {
    return this.request<{
      id: number;
      user_id: number;
      name: string;
      rest_time: number;
      created_at: string;
      exercises: {
        id: number;
        exercise_id: number;
        exercise_name: string;
        muscle_group: string;
        sort_order: number;
        sets_data: string;
        increment: number;
      }[];
      scheduledDays: number[];
    }>(`/api/templates/${id}`);
  }

  async createTemplate(data: {
    name: string;
    rest_time: number;
    days: number[];
    exercises: {
      id: number;
      name: string;
      muscle: string;
      increment: number;
      sets: { reps: number; weight: number }[];
    }[];
  }) {
    return this.request<{ id: number }>("/api/templates", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateTemplate(
    id: number,
    data: {
      name: string;
      rest_time: number;
      days: number[];
      exercises: {
        id: number;
        name: string;
        muscle: string;
        increment: number;
        sets: { reps: number; weight: number }[];
      }[];
    },
  ) {
    return this.request<{ success: boolean }>(`/api/templates/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteTemplate(id: number) {
    return this.request<{ success: boolean }>(`/api/templates/${id}`, {
      method: "DELETE",
    });
  }

  // Workouts
  async createWorkout(templateId: number) {
    return this.request<{ workout_id: number }>("/api/workouts", {
      method: "POST",
      body: JSON.stringify({ template_id: templateId }),
    });
  }

  async completeWorkout(
    workoutId: number,
    sets: {
      exercise_id: number;
      set_number: number;
      weight: number;
      reps: number;
    }[],
  ) {
    return this.request<{ success: boolean }>(
      `/api/workouts/${workoutId}/complete`,
      {
        method: "POST",
        body: JSON.stringify({ sets }),
      },
    );
  }

  async getWorkoutHistory(limit = 10) {
    return this.request<
      {
        id: number;
        template_id: number;
        template_name: string;
        started_at: string;
        completed_at: string;
      }[]
    >(`/api/workouts?limit=${limit}`);
  }

  // Schedule
  async getSchedule() {
    return this.request<
      {
        day_of_week: number;
        template_id: number | null;
        template_name: string | null;
      }[]
    >("/api/schedule");
  }

  // Stats
  async getStats() {
    return this.request<{
      totalWorkouts: number;
      thisWeekWorkouts: number;
    }>("/api/stats");
  }

  async getConsistencyStats(weeks = 12) {
    return this.request<{
      scheduledPerWeek: number;
      weeks: {
        week: string;
        completed: number;
        scheduled: number;
        consistency: number;
      }[];
    }>(`/api/stats/consistency?weeks=${weeks}`);
  }

  async getStrengthStats(exerciseId?: number, weeks = 12) {
    const params = new URLSearchParams({ weeks: weeks.toString() });
    if (exerciseId) params.set('exercise_id', exerciseId.toString());
    return this.request<
      | {
          exercise_id: number;
          exercise_name: string;
          data: { date: string; max_weight: number; max_volume: number }[];
        }
      | {
          exercises: {
            exercise_id: number;
            exercise_name: string;
            muscle_group: string;
            max_weight: number;
            workout_count: number;
          }[];
        }
    >(`/api/stats/strength?${params}`);
  }

  async getStrengthTrend(weeks = 12) {
    return this.request<{
      weeks: {
        week: string;
        totalVolume: number;
        workouts: number;
        avgVolumePerWorkout: number;
      }[];
    }>(`/api/stats/strength-trend?weeks=${weeks}`);
  }

  // Home data
  async getHomeData(dayOfWeek: number) {
    return this.request<{
      calendarDays: {
        dayName: string;
        dayNumber: number;
        isToday: boolean;
        hasWorkout: boolean;
      }[];
      todaySchedule: { template_id: number; template_name: string } | null;
      exerciseList: string;
      totalWorkouts: number;
      thisWeekWorkouts: number;
      recentWorkouts: {
        id: number;
        template_name: string;
        started_at: string;
        completed_at: string;
      }[];
    }>(`/api/home?dow=${dayOfWeek}`);
  }

  // Active workout template data
  async getActiveTemplate(id: number) {
    return this.request<{
      template: { id: number; name: string; rest_time: number };
      exercises: {
        exercise_id: number;
        exercise_name: string;
        muscle_group: string;
        increment: number;
        lastSets: { weight: number; reps: number }[];
        templateSets: { reps: number; weight: number }[];
      }[];
    }>(`/api/templates/${id}/active`);
  }
}

export const api = new ApiClient();
