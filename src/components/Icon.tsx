import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowRight, faArrowTrendUp, faChevronDown, faChevronRight, faCircleCheck, faCirclePlay, faCircleStop, faCircleXmark,
  faComment, faDiagramProject, faHand, faHourglassHalf, faLayerGroup, faLinkSlash, faRobot, faTerminal, faXmark, type IconDefinition,
} from '@fortawesome/free-solid-svg-icons';
import type { IconKey } from '../lib/card-model';

const ICONS: Record<IconKey, IconDefinition> = {
  terminal: faTerminal, workflow: faDiagramProject, robot: faRobot, running: faCirclePlay, done: faCircleCheck, waiting: faHand,
  yourTurn: faComment, stale: faLinkSlash, ended: faCircleStop, rejected: faCircleXmark, silent: faHourglassHalf, outlier: faArrowTrendUp,
  probable: faLayerGroup, close: faXmark, arrowRight: faArrowRight, chevronRight: faChevronRight, chevronDown: faChevronDown,
};

interface IconProps {
  name: IconKey;
  label?: string;
  className?: string;
}

/** Ícone decorativo; com `label` vira imagem com nome para leitor de tela. */
export function Icon({ name, label, className }: IconProps) {
  return <FontAwesomeIcon icon={ICONS[name]} className={className} fixedWidth role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}
