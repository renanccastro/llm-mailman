import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { prisma } from '@ai-dev/database';
import { GitHubProfile } from '../types';

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';
const GITHUB_CALLBACK_URL =
  process.env.GITHUB_CALLBACK_URL || 'http://localhost:4000/auth/github/callback';

export function initializeGitHubOAuth(): void {
  passport.use(
    new GitHubStrategy(
      {
        clientID: GITHUB_CLIENT_ID,
        clientSecret: GITHUB_CLIENT_SECRET,
        callbackURL: GITHUB_CALLBACK_URL,
        scope: ['user:email', 'read:user', 'repo'],
      },
      async (
        accessToken: string,
        _refreshToken: string,
        profile: any,
        done: (error: any, user?: any) => void,
      ) => {
        try {
          const githubProfile: GitHubProfile = {
            id: profile.id,
            username: profile.username,
            displayName: profile.displayName,
            emails: profile.emails,
            photos: profile.photos,
            provider: profile.provider,
          };

          // Find or create user
          const email = githubProfile.emails?.find((e) => e.verified)?.value || '';
          const avatarUrl = githubProfile.photos?.[0]?.value || null;

          const user = await prisma.user.upsert({
            where: { githubId: githubProfile.id },
            update: {
              email: email || undefined,
              githubUsername: githubProfile.username,
              name: githubProfile.displayName || undefined,
              avatarUrl: avatarUrl || undefined,
              lastActiveAt: new Date(),
            },
            create: {
              githubId: githubProfile.id,
              githubUsername: githubProfile.username,
              email,
              name: githubProfile.displayName,
              avatarUrl,
              privateEmail: `${githubProfile.username.toLowerCase()}@aidev.platform`,
            },
          });

          // Store GitHub access token as API token
          await prisma.apiToken.upsert({
            where: {
              userId_service: {
                userId: user.id,
                service: 'github',
              },
            },
            update: {
              encryptedToken: accessToken, // TODO: Encrypt this
              lastUsedAt: new Date(),
              isActive: true,
            },
            create: {
              userId: user.id,
              name: 'GitHub OAuth',
              service: 'github',
              encryptedToken: accessToken, // TODO: Encrypt this
              isActive: true,
            },
          });

          return done(null, user);
        } catch (error) {
          console.error('GitHub OAuth error:', error);
          return done(error);
        }
      },
    ),
  );

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id },
      });
      done(null, user);
    } catch (error) {
      done(error);
    }
  });
}