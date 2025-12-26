/**
 * Cycle calculation and weight progression utilities for programmes
 */

import { db, getLastSetsForExercise, type Template, type TemplateExercise } from '$lib/db';

export interface CycleProgress {
	completedIds: Set<number>;  // Template IDs completed in current cycle
	totalTemplates: number;
	cycleComplete: boolean;
	currentCycle: number;  // How many full cycles completed
}

/**
 * Calculate the current cycle progress for a programme.
 * A cycle is complete when all templates in the programme have been done once.
 * Walking backwards through workout history to find current cycle state.
 */
export async function calculateCycleProgress(
	userId: number,
	programmeId: number
): Promise<CycleProgress> {
	// Get all templates in this programme
	const templates = await db.templates
		.where('programme_id')
		.equals(programmeId)
		.toArray();

	const templateIds = new Set(templates.map(t => t.id));
	const totalTemplates = templateIds.size;

	if (totalTemplates === 0) {
		return {
			completedIds: new Set(),
			totalTemplates: 0,
			cycleComplete: false,
			currentCycle: 0
		};
	}

	// Get all completed workouts for these templates, ordered by date DESC
	const workouts = await db.workouts
		.where('user_id')
		.equals(userId)
		.filter(w => w.completed_at !== null && w.template_id !== null && templateIds.has(w.template_id))
		.toArray();

	// Sort by completed_at descending (most recent first)
	workouts.sort((a, b) =>
		new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime()
	);

	// Walk backwards through workouts to find current cycle state
	let cycleCount = 0;
	let completedInCurrentCycle = new Set<number>();

	for (const workout of workouts) {
		const templateId = workout.template_id!;

		if (completedInCurrentCycle.has(templateId)) {
			// Template repeated - we've found the boundary of the current cycle
			// Everything before this belongs to previous cycles
			break;
		}

		completedInCurrentCycle.add(templateId);

		// Check if we just completed a full cycle
		if (completedInCurrentCycle.size === totalTemplates) {
			cycleCount++;
			completedInCurrentCycle = new Set();
		}
	}

	return {
		completedIds: completedInCurrentCycle,
		totalTemplates,
		cycleComplete: completedInCurrentCycle.size === totalTemplates,
		currentCycle: cycleCount
	};
}

/**
 * Get the ordered list of template IDs in a programme for display
 */
export async function getProgrammeTemplateOrder(programmeId: number): Promise<number[]> {
	const templates = await db.templates
		.where('programme_id')
		.equals(programmeId)
		.toArray();

	// Sort by ID for consistent ordering (or could add a sort_order field later)
	return templates.sort((a, b) => a.id - b.id).map(t => t.id);
}

export interface DisplayWeightResult {
	weight: number;
	source: 'template' | 'history';
	incrementApplied: boolean;
}

/**
 * Calculate the display weight for an exercise based on:
 * 1. Last completed workout weight
 * 2. Whether a cycle has been completed (apply increment)
 *
 * @param userId - The user ID
 * @param programmeId - The programme ID (for cycle calculation)
 * @param templateId - The template ID (to check if done in current cycle)
 * @param exerciseId - The exercise ID
 * @param templateExercise - The template exercise data (for defaults and increment)
 */
export async function calculateDisplayWeight(
	userId: number,
	programmeId: number,
	templateId: number,
	exerciseId: number,
	templateExercise: TemplateExercise
): Promise<DisplayWeightResult> {
	const templateSets = JSON.parse(templateExercise.sets_data || '[]') as { reps: number; weight: number }[];
	const increment = templateExercise.increment || 2.5;
	const templateDefaultWeight = templateSets[0]?.weight ?? 20;

	// Get last workout sets for this exercise
	const lastSets = await getLastSetsForExercise(userId, exerciseId);

	if (lastSets.length === 0) {
		// No history - use template defaults
		return {
			weight: templateDefaultWeight,
			source: 'template',
			incrementApplied: false
		};
	}

	// We have history - get the last weight used
	const lastWeight = lastSets[0]?.weight ?? templateDefaultWeight;

	// Check cycle progress
	const cycleProgress = await calculateCycleProgress(userId, programmeId);

	// Apply increment if:
	// 1. A full cycle has been completed (cycleComplete = true)
	// 2. This template hasn't been done yet in the new cycle
	const templateDoneInCurrentCycle = cycleProgress.completedIds.has(templateId);
	const shouldApplyIncrement = cycleProgress.cycleComplete && !templateDoneInCurrentCycle;

	return {
		weight: shouldApplyIncrement ? lastWeight + increment : lastWeight,
		source: 'history',
		incrementApplied: shouldApplyIncrement
	};
}

/**
 * Calculate display weights for all exercises in a template
 */
export async function calculateTemplateDisplayWeights(
	userId: number,
	programmeId: number,
	templateId: number,
	templateExercises: TemplateExercise[]
): Promise<Map<number, DisplayWeightResult>> {
	const results = new Map<number, DisplayWeightResult>();

	for (const te of templateExercises) {
		const result = await calculateDisplayWeight(
			userId,
			programmeId,
			templateId,
			te.exercise_id,
			te
		);
		results.set(te.exercise_id, result);
	}

	return results;
}
