import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const token = import.meta.env.NOTION_TOKEN;
  const databaseId = import.meta.env.NOTION_DATABASE_ID;
  const property = import.meta.env.NOTION_EMAIL_PROPERTY || 'Email';

  if (!token || !databaseId) {
    return new Response('Notion is not configured', { status: 503 });
  }

  try {
    const body = await request.json();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return new Response('A valid email is required', { status: 400 });
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    };
    const duplicateCheck = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        filter: { property, email: { equals: email } },
        page_size: 1,
      }),
    });

    if (!duplicateCheck.ok) return new Response('Unable to check email', { status: 502 });
    const { results } = await duplicateCheck.json();
    if (results?.length) return new Response('Email is already on the list', { status: 409 });

    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        parent: { database_id: databaseId },
        properties: {
          [property]: { email },
        },
      }),
    });

    if (!response.ok) return new Response('Unable to save email', { status: 502 });
    return new Response(null, { status: 204 });
  } catch {
    return new Response('Invalid request', { status: 400 });
  }
};
