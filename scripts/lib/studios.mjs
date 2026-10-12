/* Список лицензиаров, продюсеров и вещателей — НЕ анимационных студий
 * (аудит 2026-10, ТЗ 3.1.3).
 *
 * Зачем: студии в каталог приходят из Jikan (`scripts/fetch-jikan.mjs`), а он отдаёт
 * всех участников производства. Из-за этого у «Ван-Пис» в студиях стояли Funimation
 * и Viz Media (лицензиары), у «Тетради смерти» — VAP и Konami, у FMA — Aniplex и
 * Square Enix. Правильный фильтр — `isAnimationStudio` у AniList, но каталог
 * заполнен Jikan'ом, поэтому на время перехода держим курируемый список.
 *
 * Используется в scripts/repair-catalog.mjs (--fix-studios) и
 * scripts/check-catalog-quality.mjs. Ключи — в нижнем регистре.
 */
export const NOT_ANIMATION_STUDIOS = new Set(
  [
    'Funimation', 'Funimation Entertainment', 'Viz Media', 'Aniplex', 'Aniplex of America',
    'Crunchyroll', 'Sentai Filmworks', 'Nihon Ad Systems', 'Dentsu', 'Mainichi Broadcasting System',
    'TV Tokyo', 'Toho', 'Shueisha', 'Kodansha', 'Shogakukan-Shueisha Productions', 'Bandai Visual',
    'Bandai Namco Arts', 'Lantis', 'Sony Pictures Entertainment', 'Hakuhodo DY Media Partners',
    'Kadokawa', 'Kadokawa Shoten', 'ASCII Media Works', 'AT-X', 'BS Fuji', 'NHK', 'TBS', 'Fuji TV',
    'Yomiuri Telecasting', 'Shochiku', 'Toei Company', 'Square Enix', 'Konami', 'Sega', 'Bandai',
    'Bandai Namco Games', 'VAP', 'King Records', 'Avex Entertainment', 'Pony Canyon',
    'Media Factory', 'Houbunsha', 'Ichijinsha', 'Enterbrain', 'Frontier Works', 'Marvelous',
    'Marvelous AQL', 'TMS Music', 'Geneon Universal Entertainment', 'NBCUniversal Entertainment',
    'Warner Bros. Japan', 'Walt Disney Studios', 'Netflix', 'Amazon Studios', 'Hulu',
    'ADK Emotions', 'Asatsu DK', 'Sotsu', 'Sotsu Music Publishing', 'Pierrot Plus', 'DMM.com',
    'Cygames', 'Movic', 'Bushiroad', 'Good Smile Company', 'KlockWorx', 'Nippon Television Network',
    'TV Asahi', 'MBS', 'Rakuten', 'Gree', 'Mixi', 'CyberAgent', 'Happinet',
    'Pony Canyon Enterprises', 'Muse Communication', 'Aniplus', 'ARVO Animation',
  ].map((s) => s.toLowerCase()),
);
