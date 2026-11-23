export interface CountryConfigDto {
  country_code: string;
  default_locale: 'ar' | 'en';
  emergency_numbers: {
    police: string;
    ambulance: string;
    fire: string;
    unified: string;
  };
  sos_enabled: boolean;
  financial_features_enabled: boolean;
  data_retention_days: number;
  min_age: number;
  legal_review_status: 'pending' | 'approved' | 'restricted';
}

export interface SessionUserDto {
  id: string;
  email: string | null;
  role: 'member' | 'moderator' | 'admin' | 'partner';
  country_code: string;
  timezone: string;
  trust_level: number;
  display_name: string;
  region_code: string;
  preferred_locale: 'ar' | 'en';
  bio_short: string | null;
  private_contact: {
    phone_e164: string | null;
    preferred_channel: string;
    emergency_note: string | null;
  } | null;
}

export interface SwitchableUserDto {
  id: string;
  role: string;
  country_code: string;
  trust_level: number;
  display_name: string;
  region_code: string;
  preferred_locale: 'ar' | 'en';
}

export interface MatchExplanationDto {
  skill_score: number;
  region_score: number;
  availability_score: number;
  load_balance_score: number;
  total_score: number;
  region_match_level: 'exact_cell' | 'same_region' | 'same_country';
  open_tasks_count: number;
  sensitive_qualified: boolean;
  factors_excluded: string[];
}

export interface MatchDto {
  id: string;
  need_id: string;
  offer_id: string;
  provider_id: string;
  provider_name: string;
  score: number;
  explanation: MatchExplanationDto;
  status: 'suggested' | 'accepted_by_requester' | 'accepted_by_provider' | 'accepted_both' | 'declined' | 'withdrawn';
}

export interface NeedDto {
  id: string;
  requester_id: string;
  requester_name: string;
  title: string;
  description: string;
  category: string;
  urgency: string;
  status: string;
  is_sensitive: boolean;
  region_code: string;
  time_window_start: string;
  time_window_end: string;
  expires_at: string;
  signed_attachment_url: string | null;
  is_sos: boolean;
  circle_ids: string[];
  matches: MatchDto[];
  created_at: string;
}

export interface OfferDto {
  id: string;
  provider_id: string;
  provider_name: string;
  provider_trust_level: number;
  circle_id: string;
  circle_name: string;
  category: string;
  title: string;
  description: string | null;
  region_code: string;
  available_from: string;
  available_until: string;
  capacity_total: number;
  capacity_remaining: number;
}

export interface CircleMemberDto {
  user_id: string;
  role: string;
  approved_sensitive: number;
  display_name: string;
  region_code: string;
  trust_level: number;
}

export interface CircleDto {
  id: string;
  name: string;
  description: string | null;
  country_code: string;
  region_code: string;
  invite_code: string;
  expansion_tier: string;
  member_role: string;
  member_count: number;
  members: CircleMemberDto[];
}
