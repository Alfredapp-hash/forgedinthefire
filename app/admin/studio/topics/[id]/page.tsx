import { TopicWorkspace } from './TopicWorkspace'

export const dynamic = 'force-dynamic'

export default async function TopicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <TopicWorkspace topicId={id} />
}
