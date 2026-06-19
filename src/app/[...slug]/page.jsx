import { notFound } from 'next/navigation';
import { Hero } from '../../components/Hero.jsx';
import { Stats } from '../../components/Stats.jsx';
import { getPageFromSlug, getPagePaths } from '../../utils/content.js';

export const revalidate = 3600;

export async function generateStaticParams() {
  try {
    const paths = await getPagePaths();
    return paths
      .filter((p) => p !== '/')
      .map((p) => ({ slug: p.slice(1).split('/') }));
  } catch {
    return [];
  }
}

const componentMap = {
  hero: Hero,
  stats: Stats,
};

export default async function ComposablePage({ params }) {
  const { slug } = params;
  
  const pageSlug = slug.join('/');

  try {
    const page = await getPageFromSlug(`/${pageSlug}`);

    if (!page) {
      return notFound();
    }

    return (
      <div data-sb-object-id={page.id}>
        {(page.sections || []).map((section, idx) => {
          const Component = componentMap[section.type];
          return <Component key={idx} {...section} />;
        })}
      </div>
    );
  } catch (error) {
    console.error(error.message);
    return notFound();
  }
}
