package org.waffle.nativedemo;

import android.content.pm.ApplicationInfo;
import org.libsdl.app.SDLActivity;

/** SDL 3.4.20 activity shell. Native entry is SDL_main in libmain.so. */
public class WaffleActivity extends SDLActivity {
    @Override
    protected String[] getArguments() {
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            int frames = getIntent().getIntExtra("waffle_bench", 0);
            if (frames > 0) {
                return new String[]{"--bench", Integer.toString(frames), "--long-benchmark"};
            }
        }
        return super.getArguments();
    }
}
