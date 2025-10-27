export type Season = {
  id: string;
  name: string;
  description: string;
  startedAt: string; // ISO string
  durationHours: number;
};

export type Station = {
  id: string;
  name: string;
  position: {
    x: number; // percentage 0-100
    y: number;
  };
  tags: string[];
};

export type Track = {
  id: string;
  from: string;
  to: string;
  status: 'open' | 'under_construction';
};

export type StationStats = {
  stationId: string;
  deliveries: number;
  delays: number;
  averageDelaySeconds: number;
  congestionScore: number;
};

export type NetworkSnapshot = {
  stations: Station[];
  tracks: Track[];
};

export type DispatchStatus = 'en_route' | 'arrived';

export type RailEvent = {
  id: string;
  stationId: string;
  description: string;
  multiplier: number;
  createdAt: string;
  expiresAt: string;
};

export type TrainDispatch = {
  id: string;
  from: string;
  to: string;
  dispatchedBy: string;
  dispatchedAt: string;
  arrivalAt: string;
  durationSeconds: number;
  status: DispatchStatus;
  congestionFactor: number;
  completedAt?: string;
};

export type DispatchLog = {
  entries: TrainDispatch[];
  cooldownRemainingSeconds: number;
  activeCount: number;
  stationStats: StationStats[];
};

export type ClearDispatchResponse = {
  type: 'cleared';
  dispatchLog: DispatchLog;
  objectives: ObjectiveSnapshot[];
  events: RailEvent[];
};

export type ResetCooldownResponse = {
  type: 'cooldown-reset';
  dispatchLog: DispatchLog;
  objectives: ObjectiveSnapshot[];
  events: RailEvent[];
};

export type SetSpeedResponse = {
  type: 'speed-set';
  multiplier: number;
};

export type InitResponse = {
  type: 'init';
  season: Season;
  network: NetworkSnapshot;
  dispatchLog: DispatchLog;
  objectives: ObjectiveSnapshot[];
  events: RailEvent[];
};

export type ErrorResponse = {
  status: 'error';
  code: string;
  message: string;
};

export type DispatchRequest = {
  from: string;
  to: string;
};

export type DispatchResponse = {
  type: 'dispatch';
  dispatch: TrainDispatch;
  dispatchLog: DispatchLog;
  objectives: ObjectiveSnapshot[];
  events: RailEvent[];
};

export type ObjectiveStatus = 'pending' | 'active' | 'completed';

export type ObjectiveSnapshot = {
  id: string;
  title: string;
  description: string;
  progress: number;
  target: number;
  status: ObjectiveStatus;
  stationIds: string[];
};
