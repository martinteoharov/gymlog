import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
	appId: 'com.gymlog.app',
	appName: 'OpenRep',
	webDir: 'build',
	server: {
		// For development, you can use your local API
		// url: 'http://localhost:5173',
		// cleartext: true
	},
	ios: {
		contentInset: 'never',
		backgroundColor: '#1c1c1e'
	},
	android: {
		backgroundColor: '#1c1c1e'
	}
};

export default config;
