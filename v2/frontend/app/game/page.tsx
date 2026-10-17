import { Suspense } from 'react';
import GamePage from './GamePage';

// One static page for every game: the id comes from `?id=`.
export default function Page() {
    return (
        <Suspense>
            <GamePage />
        </Suspense>
    );
}
