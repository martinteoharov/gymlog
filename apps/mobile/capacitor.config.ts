import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
	appId: 'com.gymlog.app',
	appName: 'GymLog',
	webDir: 'build',
	server: {
		// For development, you can use your local API
		// url: 'http://localhost:5173',
		// cleartext: true
	},
	ios: {
		contentInset: 'automatic'
	},
	android: {
		backgroundColor: '#1c1c1e'
	}
};

export default config;
