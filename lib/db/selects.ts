export const PAPER_SELECT =
  "id,user_id,team_id,title,authors,year,abstract,paper_type,doi,url,metadata,is_favorite,created_at,updated_at"

export const PAPER_LIST_SELECT = PAPER_SELECT

export const PAPER_SEARCH_SELECT =
  "id,user_id,team_id,title,authors,year,paper_type,doi,url,is_favorite,created_at,updated_at"

export const PAPER_FILE_SELECT =
  "id,paper_id,file_name,file_path,file_size,mime_type,created_at"

export const NOTE_SELECT = "id,paper_id,user_id,title,content,created_at,updated_at"

export const FOLDER_SELECT =
  "id,user_id,team_id,parent_id,name,icon,color,position,created_at,updated_at"

export const TAG_SELECT = "id,user_id,name,color,created_at"

export const TEAM_SELECT = "id,name,description,icon,color,created_by,created_at,updated_at"

export const PROFILE_SELECT =
  "id,email,full_name,avatar_url,plan,stripe_customer_id,stripe_subscription_id,billing_status,plan_renewal_at,cancel_at_period_end,billing_grace_until,billing_last_event_created,paper_summary_model,created_at,updated_at"
