interface ImportMetaEnv {
	readonly RIDE_CONTROL_BUILD_PR_URL: string;
	readonly RIDE_CONTROL_BUILD_TIMESTAMP_UTC: string;
	readonly VITE_RIDECONTROL_API_URL?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
