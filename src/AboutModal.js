import React, { useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { Button, Tooltip } from 'antd';
import { HiOutlineXMark } from 'react-icons/hi2';
import { FaGithub } from 'react-icons/fa';

// Velokarte: dropped Brazilian sponsor logos (itdp, ucb, premiobicicletabrasil)
// from the footer — those orgs aren't relevant for a Latvian fork. Attribution
// to the upstream CicloMapa project is preserved via the GitHub link.

import { ABOUT_MODAL_ALWAYS_AUTO_OPEN_IN_NON_PROD, IS_PROD } from './config/constants.js';
import { getPredefinedCityStaticLocation } from './config/citySlugCatalog.js';
import { getAboutModalMetrics } from './aboutModalMetrics.js';
import Logo from './components/Logo';
import InfrastructureBadge from './components/InfrastructureBadge';
import { handleModalKeyDown, setupModalFocus, restoreModalFocus } from './modalFocusTrap';
import { appendKmUnit } from './utils/routeUtils.js';

/** Must sit above `.app-modal-root` (`--z-app-modal` in App.less is 1210). */
const ABOUT_MODAL_FOOTER_TOOLTIP_Z_INDEX = 1220;

const CITY_ABOUT_OSM_URL = 'https://www.openstreetmap.org/';

const WELCOME_SEEN_STORAGE_KEY = 'ciclomapa_welcomeSeen:v3';

/**
 * Welcome About modal auto-open logic (kept here to stay close to the About modal + its persistence key).
 * Note: this is also used by `App` to decide initial UI state (avoid first-paint flicker).
 * @param {{
 *  embedMode: boolean,
 *  fromMount: boolean,
 *  openAboutModal?: () => void
 * }} options
 */
export function shouldAutoOpenWelcomeAboutModal(options) {
  const fromMount = options?.fromMount === true;
  const embedMode = options?.embedMode === true;
  if (embedMode) return false;

  if (!IS_PROD && ABOUT_MODAL_ALWAYS_AUTO_OPEN_IN_NON_PROD) {
    return fromMount;
  }

  try {
    return window.localStorage.getItem(WELCOME_SEEN_STORAGE_KEY) !== '1';
  } catch {
    return false;
  }
}

export function maybeAutoOpenWelcomeAboutModal(options) {
  const openAboutModal = options?.openAboutModal;
  if (typeof openAboutModal !== 'function') return;
  if (!shouldAutoOpenWelcomeAboutModal(options)) return;
  openAboutModal();
}

/**
 * @param {string | undefined} canonicalSlug
 * @returns {{ canonicalSlug: string; primary: string; fullLabel: string } | null}
 */
function getCityAboutContext(canonicalSlug) {
  if (!canonicalSlug) return null;
  const staticLocation = getPredefinedCityStaticLocation(canonicalSlug);
  if (!staticLocation?.areaLabel) return null;
  const primary = staticLocation.areaLabel.split(',')[0]?.trim() || '';
  return {
    canonicalSlug,
    primary,
    fullLabel: staticLocation.areaLabel,
  };
}

const aboutModalSecondaryButtonClass = (isDarkMode) =>
  ['font-semibold', isDarkMode ? '!text-gray-200 hover:!bg-white/10' : ''].join(' ');

/** Mini bar inside InfrastructureBadge while metrics load (Tailwind v2 CDN utilities). */
function AboutModalMetricSkeleton({ isDarkMode, wide = false }) {
  return (
    <span
      data-testid="about-modal-metric-skeleton"
      className={[
        'inline-block h-3 flex-shrink-0 rounded-full align-middle animate-pulse-2x',
        wide ? 'w-10' : 'w-6',
        isDarkMode ? 'bg-white bg-opacity-30' : 'bg-black bg-opacity-20',
      ].join(' ')}
      aria-hidden
    />
  );
}

AboutModalMetricSkeleton.propTypes = {
  isDarkMode: PropTypes.bool,
  wide: PropTypes.bool,
};

function AboutModal({
  visible,
  onClose,
  openLayersLegendModal,
  openCityPicker,
  embedMode = false,
  isDarkMode = true,
  cityCanonicalSlug,
  lengths,
  layers,
  mapDataLoading = false,
  /** When false, map data for the current view is not in state yet (e.g. before storage/OSM resolves). */
  mapHasGeoJson = true,
}) {
  const modalRef = useRef(null);
  const previousActiveElementRef = useRef(null);

  const cityContext = useMemo(() => getCityAboutContext(cityCanonicalSlug), [cityCanonicalSlug]);

  const handleClose = () => {
    try {
      window.localStorage.setItem(WELCOME_SEEN_STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
    onClose();
  };

  const dismissAndThen = (fn) => {
    handleClose();
    if (typeof fn === 'function') fn();
  };

  const metrics = useMemo(() => {
    if (!cityContext) return null;
    return getAboutModalMetrics(lengths, layers);
  }, [cityContext, lengths, layers]);

  const showQuickMetricsSkeleton = mapDataLoading || !mapHasGeoJson;

  useEffect(() => {
    if (visible) {
      setupModalFocus(modalRef, previousActiveElementRef);
      const boundKeyDown = (e) => handleModalKeyDown(e, modalRef, handleClose);
      document.addEventListener('keydown', boundKeyDown);
      return () => {
        document.removeEventListener('keydown', boundKeyDown);
        restoreModalFocus(previousActiveElementRef);
      };
    }
  }, [visible, onClose]);

  const inlineLinkClass = `underline decoration-dotted text-current font-medium ${isDarkMode ? 'hover:text-white' : 'hover:text-gray-900'}`;

  const footerPartnerLinkClass = [
    'h-7 flex items-center rounded-sm outline-none',
    isDarkMode ? 'b-and-w' : 'about-modal-partner-logo--light',
    'opacity-40 hover:opacity-100 focus-visible:opacity-100 transition-opacity duration-200',
  ].join(' ');

  const footerIconLinkClass = [
    'inline-flex items-center justify-center p-1.5 rounded-md outline-none',
    'opacity-40 hover:opacity-100 focus-visible:opacity-100 text-white transition duration-200',
    'hover:bg-white/15',
  ].join(' ');

  return createPortal(
    <div
      className={[
        'about-modal-root',
        'app-modal-root',
        'fixed inset-0 isolation-isolate',
        visible
          ? 'about-modal-root--open pointer-events-auto'
          : 'about-modal-root--closed pointer-events-none',
      ].join(' ')}
      aria-hidden={!visible}
    >
      <div
        role="presentation"
        className={[
          'fixed inset-0 z-0 transition-opacity duration-300 ease-in-out',
          isDarkMode ? 'bg-black bg-opacity-20' : 'bg-white bg-opacity-10',
          visible
            ? 'opacity-100 cursor-pointer pointer-events-auto'
            : 'opacity-0 pointer-events-none',
        ].join(' ')}
        onClick={handleClose}
      />

      <div
        className={[
          'fixed inset-0 z-10 flex pointer-events-none box-border',
          'items-center justify-center sm:items-start sm:justify-start',
          'p-4',
        ].join(' ')}
        style={{
          paddingTop: 'max(1rem, env(safe-area-inset-top))',
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
          paddingLeft: 'max(1rem, env(safe-area-inset-left))',
          paddingRight: 'max(1rem, env(safe-area-inset-right))',
        }}
      >
        <div
          ref={modalRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="about-modal-title"
          className={[
            'glass-bg w-full max-w-lg box-border text-white transition-opacity duration-300 ease-out',
            'rounded-2xl',
            'px-4 sm:px-6 pt-4 sm:pt-6',
            'overscroll-contain',
            visible ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
          ].join(' ')}
          style={{
            '--glass-bg-opacity': '0.6',
            maxHeight: 'calc(100vh - max(1rem, env(safe-area-inset-top)))',
            paddingBottom: 'max(1.75rem, env(safe-area-inset-bottom))',
            WebkitOverflowScrolling: 'touch',
            overflowY: 'auto',
          }}
        >
          <header className="flex items-start justify-between gap-4 mb-5 sm:mb-2">
            <div className="-ml-0.5">
              <Logo
                className={cityContext ? `b-and-w opacity-30` : 'text-5xl sm:text-6xl mt-4 mb-6'}
              />
            </div>
            <Button
              type="text"
              className="!p-2 flex items-center justify-center !min-w-0 -mt-2 -mr-2"
              onClick={handleClose}
              aria-label="Aizvērt"
              icon={<HiOutlineXMark className="text-lg opacity-70" aria-hidden />}
            />
          </header>

          <div className="mb-6">
            {cityContext ? (
              <>
                <h2
                  id="about-modal-title"
                  data-testid="about-modal-title"
                  data-about-city-slug={cityCanonicalSlug}
                  className="text-5xl sm:text-6xl leading-none mb-4 font-heading-display"
                >
                  {cityContext.primary}
                </h2>
                {metrics && (
                  <ul
                    className="flex flex-wrap gap-1.5 list-none p-0 m-0 mb-8"
                    aria-label="Šīs pilsētas ātrie rādītāji"
                    data-testid="about-modal-quick-stats"
                  >
                    <li
                      className="m-0"
                      data-testid="about-quick-ciclovia"
                      data-metric-km={
                        showQuickMetricsSkeleton
                          ? undefined
                          : (metrics.infraRows.find((r) => r.id === 'ciclovia')?.km ?? 0)
                      }
                    >
                      <InfrastructureBadge infrastructure="ciclovia" isDarkMode={isDarkMode}>
                        {showQuickMetricsSkeleton ? (
                          <AboutModalMetricSkeleton isDarkMode={isDarkMode} wide />
                        ) : (
                          <span className="tabular-nums">
                            {appendKmUnit(
                              (metrics.infraRows.find((r) => r.id === 'ciclovia')?.km ?? 0)
                                .toFixed(0)
                                .replace('.', ',')
                            )}
                          </span>
                        )}
                        <span className="font-normal"> veloceļi</span>
                      </InfrastructureBadge>
                    </li>
                    <li
                      className="m-0"
                      data-testid="about-quick-ciclofaixa"
                      data-metric-km={
                        showQuickMetricsSkeleton
                          ? undefined
                          : (metrics.infraRows.find((r) => r.id === 'ciclofaixa')?.km ?? 0)
                      }
                    >
                      <InfrastructureBadge infrastructure="ciclofaixa" isDarkMode={isDarkMode}>
                        {showQuickMetricsSkeleton ? (
                          <AboutModalMetricSkeleton isDarkMode={isDarkMode} wide />
                        ) : (
                          <span className="tabular-nums">
                            {appendKmUnit(
                              (metrics.infraRows.find((r) => r.id === 'ciclofaixa')?.km ?? 0)
                                .toFixed(0)
                                .replace('.', ',')
                            )}
                          </span>
                        )}
                        <span className="font-normal"> velojoslas</span>
                      </InfrastructureBadge>
                    </li>
                    <li
                      className="m-0"
                      data-testid="about-quick-poi"
                      data-poi-count={showQuickMetricsSkeleton ? undefined : metrics.poiTotal}
                    >
                      <InfrastructureBadge infrastructure="neutral" isDarkMode={isDarkMode}>
                        {showQuickMetricsSkeleton ? (
                          <AboutModalMetricSkeleton isDarkMode={isDarkMode} />
                        ) : (
                          <span className="tabular-nums">
                            {metrics.poiTotal.toLocaleString('lv-LV')}
                          </span>
                        )}
                        <span className="font-normal"> interešu vietas</span>
                      </InfrastructureBadge>
                    </li>
                    {/* <li className="m-0">
                      <InfrastructureBadge infrastructure="neutral" isDarkMode={isDarkMode}>
                        {!airtableMetadataLoaded ? (
                          '…'
                        ) : specialMetric ? (
                          <>
                            <span className="tabular-nums">{specialMetric.valueText}</span>
                            <span className="font-normal">
                              {' · '}
                              {specialMetric.title}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="tabular-nums">—</span>
                            <span className="font-normal"> · PNB / IDECiclo</span>
                          </>
                        )}
                      </InfrastructureBadge>
                    </li> */}
                  </ul>
                )}
              </>
            ) : (
              <h2 id="about-modal-title" data-testid="about-modal-title" className="sr-only">
                Par Velokarti
              </h2>
            )}
            <p className="mb-3 text-sm sm:text-base sm:leading-relaxed">
              Brauciet droši, plānojot maršrutus ar Velokarti: veloceļi, velojoslas, novietnes,
              servisi un viss cits, kas svarīgs riteņbraucējiem Latvijā.
            </p>
            <p className="mb-3 text-sm sm:text-base sm:leading-relaxed">
              Balstoties uz{' '}
              <a
                className={inlineLinkClass}
                href={CITY_ABOUT_OSM_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                OpenStreetMap
              </a>
              , pasaulē lielāko atvērto sadarbības karti, Velokarte uzlabo piekļuvi velo
              infrastruktūras datiem Latvijas iedzīvotājiem un pētniekiem.
            </p>
            {/* 
                {metrics && (
                  <section
                    className="mb-4"
                    aria-label="Resumo dos dados do mapa e indicadores externos quando disponíveis"
                  >
                    <h3
                      className={`text-xs font-semibold uppercase tracking-wider ${subtle} m-0 mb-3`}
                    >
                      Números nesta cidade
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className={`rounded-xl px-4 py-5 text-center ${cardSurface}`}>
                        <p
                          className={`text-3xl sm:text-4xl font-bold tabular-nums leading-none m-0 mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}
                          aria-live="polite"
                        >
                          {mapDataLoading
                            ? '…'
                            : appendKmUnit(metrics.cicloviaCiclofaixaKm.toFixed(1).replace('.', ','))}
                        </p>
                        <p className={`text-sm font-medium m-0 leading-snug ${muted}`}>
                          Ciclovias e ciclofaixas
                        </p>
                        <p className={`text-xs m-0 mt-1.5 leading-snug ${subtle}`}>
                          Via segregada ou faixa exclusiva (OSM).
                        </p>
                      </div>
                      <div className={`rounded-xl px-4 py-5 text-center ${cardSurface}`}>
                        <p
                          className={`text-3xl sm:text-4xl font-bold tabular-nums leading-none m-0 mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}
                        >
                          {mapDataLoading ? '…' : metrics.poiTotal.toLocaleString('pt-BR')}
                        </p>
                        <p className={`text-sm font-medium m-0 leading-snug ${muted}`}>
                          Pontos no mapa
                        </p>
                        <p className={`text-xs m-0 mt-1.5 leading-snug ${subtle}`}>
                          POIs somados (OSM).
                        </p>
                      </div>
                      <div className={`rounded-xl px-4 py-5 text-center ${cardSurface}`}>
                        <p
                          className={`text-3xl sm:text-4xl font-bold tabular-nums leading-none m-0 mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}
                        >
                          {!airtableMetadataLoaded
                            ? '…'
                            : specialMetric
                              ? specialMetric.valueText
                              : '—'}
                        </p>
                        <p className={`text-sm font-medium m-0 leading-snug ${muted}`}>
                          {specialMetric ? (
                            <a
                              href={specialMetric.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={inlineLinkClass}
                            >
                              {specialMetric.title}
                              {specialMetric.year != null && specialMetric.year !== ''
                                ? ` · ${specialMetric.year}`
                                : ''}
                            </a>
                          ) : (
                            'PNB ou IDECiclo'
                          )}
                        </p>
                        <p className={`text-xs m-0 mt-1.5 leading-snug ${subtle}`}>
                          {!airtableMetadataLoaded
                            ? 'Carregando…'
                            : specialMetric
                              ? specialMetric.blurb
                              : 'Painel de análises tem o detalhe.'}
                        </p>
                      </div>
                    </div>
                  </section>
                )} */}

            <div className="flex flex-wrap gap-2 mt-8 sm:mt-12 mb-3">
              <Button
                type="primary"
                size="large"
                className="font-semibold"
                data-testid="about-modal-dismiss"
                onClick={handleClose}
              >
                Sākt
              </Button>
              {cityContext ? (
                <Button
                  type="text"
                  size="large"
                  className={aboutModalSecondaryButtonClass(isDarkMode)}
                  data-testid="about-modal-open-legend"
                  onClick={() => {
                    dismissAndThen(openLayersLegendModal);
                  }}
                >
                  Kartes leģenda
                </Button>
              ) : null}
              {!cityContext ? (
                <Button
                  type="text"
                  size="large"
                  className={aboutModalSecondaryButtonClass(isDarkMode)}
                  data-testid="about-modal-open-city-picker"
                  onClick={() => {
                    dismissAndThen(openCityPicker);
                  }}
                >
                  Apskatīt pilsētas
                </Button>
              ) : null}
            </div>
          </div>

          <footer className={`pt-5 border-t border-white border-opacity-10 -mb-2`}>
            <div className="flex flex-wrap items-center gap-4 w-full">
              <div className="flex flex-wrap items-center gap-2 min-w-0 text-xs opacity-60">
                <span>
                  Velokarte ir{' '}
                  <a
                    className={inlineLinkClass}
                    href="https://github.com/cmdalbem/ciclomapa"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    CicloMapa
                  </a>{' '}
                  atzars Latvijai (GPL‑3.0).
                </span>
              </div>
              <nav
                className="flex items-center gap-2 ml-auto shrink-0 hidden sm:flex"
                aria-label="Projekta saites"
              >
                <Tooltip
                  title="Pirmkods GitHub"
                  placement="top"
                  zIndex={ABOUT_MODAL_FOOTER_TOOLTIP_Z_INDEX}
                >
                  <a
                    href="https://github.com/dzervelce/ciclomapa"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Pirmkods GitHub"
                    className={footerIconLinkClass}
                  >
                    <FaGithub className="text-xl" aria-hidden />
                  </a>
                </Tooltip>
              </nav>
            </div>
          </footer>
        </div>
      </div>
    </div>,
    document.body
  );
}

AboutModal.propTypes = {
  visible: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  openLayersLegendModal: PropTypes.func.isRequired,
  openCityPicker: PropTypes.func.isRequired,
  embedMode: PropTypes.bool,
  isDarkMode: PropTypes.bool,
  cityCanonicalSlug: PropTypes.string,
  lengths: PropTypes.objectOf(PropTypes.number),
  layers: PropTypes.array,
  mapDataLoading: PropTypes.bool,
  mapHasGeoJson: PropTypes.bool,
};

export default AboutModal;
