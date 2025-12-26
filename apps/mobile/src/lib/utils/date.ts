/**
 * Date utility functions for consistent date handling across the app
 */

export const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const DAY_NAMES_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/**
 * Get day name from day of week number (0-6, Sunday = 0)
 */
export function getDayName(dayOfWeek: number, format: 'short' | 'long' = 'short'): string {
	const names = format === 'short' ? DAY_NAMES_SHORT : DAY_NAMES_LONG;
	return names[dayOfWeek] || '';
}

/**
 * Get array of day names from array of day numbers
 */
export function getDayNames(days: number[], format: 'short' | 'long' = 'short'): string[] {
	return days.map(d => getDayName(d, format));
}

/**
 * Format days array as comma-separated string
 */
export function formatScheduledDays(days: number[], format: 'short' | 'long' = 'short'): string {
	return getDayNames(days, format).join(', ');
}

/**
 * Get current day of week (0-6, Sunday = 0)
 */
export function getTodayDayOfWeek(): number {
	return new Date().getDay();
}

/**
 * Get start of current week (Monday)
 */
export function getWeekStartDate(date: Date = new Date()): Date {
	const start = new Date(date);
	const dayOfWeek = date.getDay();
	// Convert Sunday (0) to 7 for Monday-first calculation
	const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
	start.setDate(date.getDate() - daysFromMonday);
	start.setHours(0, 0, 0, 0);
	return start;
}

/**
 * Get start of current month
 */
export function getMonthStartDate(date: Date = new Date()): Date {
	return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * Format a date string for display in workout history
 */
export function formatWorkoutDate(dateStr: string): { day: string; num: number } {
	const date = new Date(dateStr);
	return {
		day: date.toLocaleDateString('en-US', { weekday: 'short' }),
		num: date.getDate()
	};
}

/**
 * Format a date as relative time (e.g., "2 days ago", "Just now")
 */
export function formatRelativeTime(dateStr: string): string {
	const date = new Date(dateStr);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / (1000 * 60));
	const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

	if (diffMins < 1) return 'Just now';
	if (diffMins < 60) return `${diffMins} min ago`;
	if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
	if (diffDays === 1) return 'Yesterday';
	if (diffDays < 7) return `${diffDays} days ago`;

	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Check if a date is within a date range
 */
export function isDateInRange(dateStr: string, startDate: Date, endDate?: Date): boolean {
	const date = new Date(dateStr);
	if (date < startDate) return false;
	if (endDate && date > endDate) return false;
	return true;
}

/**
 * Build calendar days array for a week view (Monday-first)
 */
export function buildCalendarWeek(
	scheduledDays: Set<number>,
	baseDate: Date = new Date()
): Array<{ dayName: string; dayNumber: number; isToday: boolean; hasWorkout: boolean }> {
	const days: Array<{ dayName: string; dayNumber: number; isToday: boolean; hasWorkout: boolean }> = [];

	// Get Monday of this week
	const weekStart = getWeekStartDate(baseDate);
	const todayDate = baseDate.getDate();
	const todayMonth = baseDate.getMonth();
	const todayYear = baseDate.getFullYear();

	for (let i = 0; i < 7; i++) {
		const date = new Date(weekStart);
		date.setDate(weekStart.getDate() + i);
		const dayOfWeek = date.getDay(); // JS day of week (0=Sun, 1=Mon, etc)

		const isToday = date.getDate() === todayDate &&
			date.getMonth() === todayMonth &&
			date.getFullYear() === todayYear;

		days.push({
			dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
			dayNumber: date.getDate(),
			isToday,
			hasWorkout: scheduledDays.has(dayOfWeek)
		});
	}

	return days;
}
