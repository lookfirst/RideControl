import {
	useBodyScrollLock,
	useCloseOnEscape,
	useDialogInitialFocus,
} from '../hooks/use-dialog-behavior';

const EFFECTIVE_DATE = 'July 23, 2026';
const sectionClass = 'space-y-2';
const headingClass = 'font-bold text-base text-slate-100';
const linkClass =
	'font-semibold text-mint underline decoration-mint/40 underline-offset-2 hover:decoration-mint';

interface LegalDialogProps {
	children: React.ReactNode;
	descriptionId: string;
	onClose: () => void;
	open: boolean;
	title: string;
	titleId: string;
}

function LegalDialog({ children, descriptionId, onClose, open, title, titleId }: LegalDialogProps) {
	const closeButtonRef = useDialogInitialFocus<HTMLButtonElement>(open);
	useCloseOnEscape(open, onClose);
	useBodyScrollLock(open);

	if (!open) {
		return null;
	}

	return (
		<div className="fixed inset-0 z-60 grid place-items-center bg-black/65 p-3 backdrop-blur-sm sm:p-4">
			<section
				aria-describedby={descriptionId}
				aria-labelledby={titleId}
				aria-modal="true"
				className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-600 bg-panel shadow-2xl shadow-black/50 sm:max-h-[calc(100dvh-2rem)]"
				role="dialog"
			>
				<header className="flex shrink-0 items-start justify-between gap-4 border-line border-b px-5 py-4 sm:px-6">
					<div>
						<h2 className="font-bold text-2xl" id={titleId}>
							{title}
						</h2>
						<p className="mt-1 text-slate-400 text-xs">Effective {EFFECTIVE_DATE}</p>
					</div>
					<button
						aria-label={`Close ${title.toLowerCase()}`}
						className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-lg text-slate-400 hover:bg-slate-700 hover:text-white"
						onClick={onClose}
						ref={closeButtonRef}
						type="button"
					>
						×
					</button>
				</header>
				<div
					className="space-y-5 overflow-y-auto px-5 py-5 text-slate-300 text-sm leading-6 sm:px-6"
					id={descriptionId}
				>
					{children}
				</div>
			</section>
		</div>
	);
}

function ContactLink() {
	return (
		<a className={linkClass} href="mailto:hello@ridecontrol.xyz">
			hello@ridecontrol.xyz
		</a>
	);
}

export function PrivacyPolicyDialog({ onClose, open }: { onClose: () => void; open: boolean }) {
	return (
		<LegalDialog
			descriptionId="privacy-policy-description"
			onClose={onClose}
			open={open}
			title="Privacy Policy"
			titleId="privacy-policy-title"
		>
			<p>
				This policy explains how Ride Control handles information when you use
				RideControl.xyz.
			</p>

			<section className={sectionClass}>
				<h3 className={headingClass}>Information stored on your device</h3>
				<p>
					Ride details, workouts, comments, profile details and image, device identifiers,
					preferences, and recovery data are stored in your browser using IndexedDB or
					local storage. Ride Control does not create an account or upload your profile or
					recorded ride history. Bluetooth access is controlled by your browser and
					operating system.
				</p>
			</section>

			<section className={sectionClass}>
				<h3 className={headingClass}>Information processed to provide the service</h3>
				<p>
					Our hosting and network providers may process technical request data such as
					your IP address, browser information, requested page, and timestamp to deliver
					and protect the site. Ride Control does not use advertising or behavioral
					analytics cookies and does not use this information to build advertising
					profiles.
				</p>
			</section>

			<section className={sectionClass}>
				<h3 className={headingClass}>Optional features and external services</h3>
				<ul className="list-disc space-y-1 pl-5">
					<li>
						Browsing BikeGPX routes sends catalog, search, and route requests to the
						Ride Control backend. It does not send your recorded ride history.
					</li>
					<li>
						If an imported GPX file has no route description, Ride Control may send its
						starting coordinate to OpenStreetMap's Nominatim service to find a place
						name.
					</li>
					<li>
						Links to BikeGPX, OpenStreetMap, GitHub, and sponsorship services are
						governed by those services' own privacy practices.
					</li>
					<li>
						If you email us, your message and address are processed by our email
						provider and retained as reasonably needed to respond and maintain records.
					</li>
				</ul>
			</section>

			<section className={sectionClass}>
				<h3 className={headingClass}>Sharing and sale</h3>
				<p>
					Ride Control does not sell or rent personal information. Information may be
					handled by service providers as described above or disclosed when reasonably
					necessary to comply with law, protect the service, or prevent abuse.
				</p>
			</section>

			<section className={sectionClass}>
				<h3 className={headingClass}>Retention and your choices</h3>
				<p>
					You can edit your profile, delete sessions and workouts, forget devices, or
					clear Ride Control site data in your browser. Clearing browser data may
					permanently remove your profile and rides that you have not exported. Service
					providers retain technical request data according to their operational,
					security, and legal requirements.
				</p>
			</section>

			<section className={sectionClass}>
				<h3 className={headingClass}>Security and children</h3>
				<p>
					Keeping ride history on your device reduces centralized collection, but no
					system is completely secure. Ride Control is not directed to children under 13,
					and we do not knowingly collect their personal information.
				</p>
			</section>

			<section className={sectionClass}>
				<h3 className={headingClass}>Changes and contact</h3>
				<p>
					We may update this policy as the service changes. The effective date above shows
					the latest revision. Send privacy questions to <ContactLink />.
				</p>
			</section>
		</LegalDialog>
	);
}

export function TermsOfServiceDialog({ onClose, open }: { onClose: () => void; open: boolean }) {
	return (
		<LegalDialog
			descriptionId="terms-of-service-description"
			onClose={onClose}
			open={open}
			title="Terms of Service"
			titleId="terms-of-service-title"
		>
			<p>
				By using RideControl.xyz, you agree to these terms. If you do not agree, do not use
				the service.
			</p>

			<section className={sectionClass}>
				<h3 className={headingClass}>Personal fitness use</h3>
				<p>
					Ride Control is provided for personal fitness and training. You are responsible
					for using it lawfully, maintaining a safe riding environment, and supervising
					any minor who uses the service.
				</p>
			</section>

			<section className={sectionClass}>
				<h3 className={headingClass}>Health and safety</h3>
				<p>
					Ride Control does not provide medical advice. Consult a qualified professional
					before beginning or changing an exercise program. Stop exercising and seek
					appropriate help if you feel unwell. Inspect your bicycle, trainer, route, and
					surroundings, follow equipment instructions, and do not rely on the app where a
					connection or control failure could cause harm.
				</p>
			</section>

			<section className={sectionClass}>
				<h3 className={headingClass}>Hardware and connectivity</h3>
				<p>
					Bluetooth devices, trainers, sensors, and browsers vary. Compatibility,
					continuous connectivity, and successful resistance or shifting commands are not
					guaranteed. You remain responsible for monitoring your equipment and stopping
					safely if it behaves unexpectedly.
				</p>
			</section>

			<section className={sectionClass}>
				<h3 className={headingClass}>Your data and backups</h3>
				<p>
					Ride data is generally stored in your browser. You are responsible for exporting
					any records you want to preserve. Clearing site data, changing browsers, or
					device failure may permanently remove unexported data.
				</p>
			</section>

			<section className={sectionClass}>
				<h3 className={headingClass}>Third-party services and content</h3>
				<p>
					Routes, maps, source links, and other third-party services may have separate
					terms and may be inaccurate or unavailable. Ride Control does not control or
					endorse third-party content. Verify routes and conditions before riding.
				</p>
			</section>

			<section className={sectionClass}>
				<h3 className={headingClass}>Open-source software</h3>
				<p>
					Ride Control's{' '}
					<a
						className={linkClass}
						href="https://github.com/RideControlOrg/RideControl"
						rel="noreferrer"
						target="_blank"
					>
						frontend source code is available on GitHub
					</a>{' '}
					under the GNU General Public License version 3. That license governs copying,
					modification, and distribution of the frontend code. The backend component is
					closed source and will remain so as we develop additional capabilities. Some
					future backend-powered features may be offered as optional paid additions. These
					terms govern use of the hosted service.
				</p>
			</section>

			<section className={sectionClass}>
				<h3 className={headingClass}>Acceptable use</h3>
				<p>
					Do not misuse the service, interfere with its operation, attempt unauthorized
					access, overload its infrastructure, or use it to violate law or the rights of
					others.
				</p>
			</section>

			<section className={sectionClass}>
				<h3 className={headingClass}>Availability and disclaimers</h3>
				<p>
					The service may change, become unavailable, or be discontinued. To the fullest
					extent permitted by law, it is provided “as is” and “as available,” without
					warranties of accuracy, fitness for a particular purpose, compatibility, or
					uninterrupted operation.
				</p>
			</section>

			<section className={sectionClass}>
				<h3 className={headingClass}>Limitation of liability</h3>
				<p>
					To the fullest extent permitted by law, Ride Control's contributors and
					operators are not liable for indirect, incidental, special, consequential, or
					punitive damages, or for lost data, equipment issues, injury, or losses arising
					from use of or inability to use the service. Nothing in these terms limits
					rights or liability that cannot legally be limited.
				</p>
			</section>

			<section className={sectionClass}>
				<h3 className={headingClass}>Changes and contact</h3>
				<p>
					We may update these terms as the service changes. Continued use after an update
					means you accept the revised terms. Send questions to <ContactLink />.
				</p>
			</section>
		</LegalDialog>
	);
}
