import { writable } from 'svelte/store';

interface ConfirmState {
	open: boolean;
	title: string;
	message: string;
	confirmText: string;
	cancelText: string;
	variant: 'danger' | 'primary';
	resolve: ((value: boolean) => void) | null;
}

const initialState: ConfirmState = {
	open: false,
	title: '',
	message: '',
	confirmText: 'Confirm',
	cancelText: 'Cancel',
	variant: 'primary',
	resolve: null
};

function createConfirmStore() {
	const { subscribe, set, update } = writable<ConfirmState>(initialState);

	function confirm(options: {
		title?: string;
		message: string;
		confirmText?: string;
		cancelText?: string;
		variant?: 'danger' | 'primary';
	}): Promise<boolean> {
		return new Promise((resolve) => {
			set({
				open: true,
				title: options.title || '',
				message: options.message,
				confirmText: options.confirmText || 'Confirm',
				cancelText: options.cancelText || 'Cancel',
				variant: options.variant || 'primary',
				resolve
			});
		});
	}

	function respond(value: boolean) {
		update((state) => {
			if (state.resolve) {
				state.resolve(value);
			}
			return initialState;
		});
	}

	return {
		subscribe,
		confirm,
		respond
	};
}

export const confirmDialog = createConfirmStore();
