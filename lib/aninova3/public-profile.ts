import { createServerSupabase } from '@/lib/supabase/server';
import type { PublicProfile } from '@/components/profile/ProfileHeader';

export interface PublicProfileBundle {
  profile: PublicProfile | null;
  followers?: number;
  following?: number;
  /** Техническая ошибка для honest-состояния; текст наружу не показываем. */
  error: string | null;
}

/**
 * B2-C: публичная шапка профиля для preview.
 *
 * Читаем тот же `profiles` под anon/RLS, что и production-маршрут. Выбираем только
 * публичные поля: email, списки, история и прогресс сюда не попадают. Счётчики
 * считаются через `count` и не раскрывают строки подписок.
 */
export async function loadPreviewPublicProfile(username: string): Promise<PublicProfileBundle> {
  const supabase = await createServerSupabase();
  if (!supabase) return { profile: null, error: 'Supabase не настроен' };

  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, username, avatar_url, banner_url, bio, pinned_achievements')
    .eq('username', username)
    .maybeSingle<PublicProfile>();

  if (error) return { profile: null, error: error.message };
  if (!data) return { profile: null, error: null };

  const [followers, following] = await Promise.all([
    supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', data.user_id),
    supabase.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', data.user_id),
  ]);

  return {
    profile: data,
    followers: followers.error ? undefined : (followers.count ?? 0),
    following: following.error ? undefined : (following.count ?? 0),
    error: null,
  };
}
